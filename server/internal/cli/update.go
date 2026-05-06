package cli

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

const DefaultUpdateDownloadTimeout = 120 * time.Second

// GitHubRelease is the subset of the GitHub releases API response we need.
type GitHubRelease struct {
	TagName string               `json:"tag_name"`
	HTMLURL string               `json:"html_url"`
	Assets  []GitHubReleaseAsset `json:"assets"`
}

type GitHubReleaseAsset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
}

func releaseArchiveExtension(goos string) string {
	if goos == "windows" {
		return "zip"
	}
	return "tar.gz"
}

func normalizeReleaseTag(targetVersion string) string {
	tag := strings.TrimSpace(targetVersion)
	if !strings.HasPrefix(tag, "v") {
		tag = "v" + tag
	}
	return tag
}

// releaseAssetCandidates returns asset filename candidates ordered by preference.
// publish.yml creates raw binaries (multicacan-{os}-{arch}); goreleaser creates
// versioned archives (multicacan-cli-{ver}-{os}-{arch}.tar.gz) and a legacy
// archive (multicacan_{os}_{arch}.tar.gz). tagName is the release tag (e.g.
// "v0.2.30" or "latest"); a "latest" tag only has raw binaries.
func releaseAssetCandidates(tagName, goos, goarch string) []string {
	ext := releaseArchiveExtension(goos)

	rawName := fmt.Sprintf("multicacan-%s-%s", goos, goarch)
	if goos == "windows" {
		rawName = fmt.Sprintf("multicacan-%s-%s.exe", goos, goarch)
	}
	candidates := []string{rawName}

	// Goreleaser versioned archives are only present for semver tags.
	if tagName != "" && tagName != "latest" {
		ver := strings.TrimPrefix(tagName, "v")
		candidates = append(candidates,
			fmt.Sprintf("multicacan-cli-%s-%s-%s.%s", ver, goos, goarch, ext),
			fmt.Sprintf("multicacan_%s_%s.%s", goos, goarch, ext),
		)
	}
	return candidates
}

func findReleaseAsset(assets []GitHubReleaseAsset, tagName, goos, goarch string) (*GitHubReleaseAsset, error) {
	for _, candidate := range releaseAssetCandidates(tagName, goos, goarch) {
		for i := range assets {
			if assets[i].Name == candidate {
				return &assets[i], nil
			}
		}
	}

	candidates := strings.Join(releaseAssetCandidates(tagName, goos, goarch), ", ")
	return nil, fmt.Errorf("no matching release asset for %s/%s (tried: %s)", goos, goarch, candidates)
}

func fetchReleaseByTag(tag string) (*GitHubRelease, error) {
	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequest(http.MethodGet, "https://api.github.com/repos/canfidelity/multicacan/releases/tags/"+tag, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GitHub API returned %d", resp.StatusCode)
	}

	var release GitHubRelease
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return nil, err
	}
	return &release, nil
}

// FetchLatestRelease fetches the latest release from the multicacan GitHub repo.
func FetchLatestRelease() (*GitHubRelease, error) {
	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequest(http.MethodGet, "https://api.github.com/repos/canfidelity/multicacan/releases/tags/latest", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GitHub API returned %d", resp.StatusCode)
	}

	var release GitHubRelease
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return nil, err
	}
	return &release, nil
}

// IsBrewInstall checks whether the running multica binary was installed via Homebrew.
func IsBrewInstall() bool {
	exePath, err := os.Executable()
	if err != nil {
		return false
	}
	resolved, err := filepath.EvalSymlinks(exePath)
	if err != nil {
		resolved = exePath
	}

	brewPrefix := GetBrewPrefix()
	if brewPrefix != "" && strings.HasPrefix(resolved, brewPrefix) {
		return true
	}

	for _, prefix := range []string{"/opt/homebrew", "/usr/local", "/home/linuxbrew/.linuxbrew"} {
		if strings.HasPrefix(resolved, prefix+"/Cellar/") {
			return true
		}
	}
	return false
}

// GetBrewPrefix returns the Homebrew prefix by running `brew --prefix`, or empty string.
func GetBrewPrefix() string {
	out, err := exec.Command("brew", "--prefix").Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

// UpdateViaBrew runs `brew upgrade multicacan`.
// Returns the combined output and any error.
func UpdateViaBrew() (string, error) {
	cmd := exec.Command("brew", "upgrade", "multicacan")
	out, err := cmd.CombinedOutput()
	if err != nil {
		return string(out), fmt.Errorf("brew upgrade failed: %w", err)
	}
	return string(out), nil
}

func updateDownloadTimeoutOrDefault(timeout time.Duration) time.Duration {
	if timeout <= 0 {
		return DefaultUpdateDownloadTimeout
	}
	return timeout
}

// UpdateViaDownload downloads the latest release binary from GitHub and replaces
// the current executable in-place. Returns the combined output message and any error.
func UpdateViaDownload(targetVersion string) (string, error) {
	return UpdateViaDownloadWithTimeout(targetVersion, DefaultUpdateDownloadTimeout)
}

// UpdateViaDownloadWithTimeout downloads a specific release binary with a caller-selected timeout.
func UpdateViaDownloadWithTimeout(targetVersion string, downloadTimeout time.Duration) (string, error) {
	tag := normalizeReleaseTag(targetVersion)
	release, err := fetchReleaseByTag(tag)
	if err != nil {
		return "", fmt.Errorf("fetch release metadata: %w", err)
	}
	return UpdateViaDownloadRelease(release, downloadTimeout)
}

// UpdateViaDownloadRelease downloads the binary from a pre-fetched GitHub release
// and replaces the current executable in-place.
func UpdateViaDownloadRelease(release *GitHubRelease, downloadTimeout time.Duration) (string, error) {
	// Determine current binary path.
	exePath, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("resolve executable path: %w", err)
	}
	exePath, err = filepath.EvalSymlinks(exePath)
	if err != nil {
		return "", fmt.Errorf("resolve symlink: %w", err)
	}

	asset, err := findReleaseAsset(release.Assets, release.TagName, runtime.GOOS, runtime.GOARCH)
	if err != nil {
		return "", err
	}

	// Download asset.
	client := &http.Client{Timeout: updateDownloadTimeoutOrDefault(downloadTimeout)}
	resp, err := client.Get(asset.BrowserDownloadURL)
	if err != nil {
		return "", fmt.Errorf("download failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("download failed: HTTP %d from %s", resp.StatusCode, asset.BrowserDownloadURL)
	}

	// Extract binary from archive, or read directly for raw binaries.
	binaryName := "multicacan"
	if runtime.GOOS == "windows" {
		binaryName = "multicacan.exe"
	}
	var binaryData []byte
	switch {
	case strings.HasSuffix(asset.Name, ".tar.gz"):
		binaryData, err = extractBinaryFromTarGz(resp.Body, binaryName)
	case strings.HasSuffix(asset.Name, ".zip"):
		binaryData, err = extractBinaryFromZip(resp.Body, binaryName)
	default:
		binaryData, err = io.ReadAll(resp.Body)
	}
	if err != nil {
		return "", fmt.Errorf("read binary from %s: %w", asset.Name, err)
	}

	// Atomic replace: write to temp file, then rename over the original.
	dir := filepath.Dir(exePath)
	tmpFile, err := os.CreateTemp(dir, "multicacan-update-*")
	if err != nil {
		return "", fmt.Errorf("create temp file: %w", err)
	}
	tmpPath := tmpFile.Name()

	if _, err := tmpFile.Write(binaryData); err != nil {
		tmpFile.Close()
		os.Remove(tmpPath)
		return "", fmt.Errorf("write temp file: %w", err)
	}
	tmpFile.Close()

	// Preserve original file permissions.
	info, err := os.Stat(exePath)
	if err != nil {
		os.Remove(tmpPath)
		return "", fmt.Errorf("stat original binary: %w", err)
	}
	if err := os.Chmod(tmpPath, info.Mode()); err != nil {
		os.Remove(tmpPath)
		return "", fmt.Errorf("chmod temp file: %w", err)
	}

	// Replace the original binary. On Windows this moves the running executable
	// aside first; on Unix a plain rename over the running inode is fine.
	if err := replaceBinary(tmpPath, exePath); err != nil {
		os.Remove(tmpPath)
		return "", fmt.Errorf("replace binary: %w", err)
	}

	return fmt.Sprintf("Downloaded %s and replaced %s", asset.Name, exePath), nil
}

// extractBinaryFromTarGz reads a .tar.gz stream and returns the contents of the
// named file entry.
func extractBinaryFromTarGz(r io.Reader, name string) ([]byte, error) {
	gz, err := gzip.NewReader(r)
	if err != nil {
		return nil, fmt.Errorf("gzip reader: %w", err)
	}
	defer gz.Close()

	tr := tar.NewReader(gz)
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			return nil, fmt.Errorf("binary %q not found in archive", name)
		}
		if err != nil {
			return nil, fmt.Errorf("read tar: %w", err)
		}
		// Match the binary name (may be prefixed with a directory).
		if filepath.Base(hdr.Name) == name && hdr.Typeflag == tar.TypeReg {
			data, err := io.ReadAll(tr)
			if err != nil {
				return nil, fmt.Errorf("read binary: %w", err)
			}
			return data, nil
		}
	}
}

// extractBinaryFromZip reads a .zip stream and returns the contents of the
// named file entry. The zip format requires random access, so the full archive
// is buffered in memory.
func extractBinaryFromZip(r io.Reader, name string) ([]byte, error) {
	buf, err := io.ReadAll(r)
	if err != nil {
		return nil, fmt.Errorf("read zip data: %w", err)
	}

	zr, err := zip.NewReader(bytes.NewReader(buf), int64(len(buf)))
	if err != nil {
		return nil, fmt.Errorf("zip reader: %w", err)
	}

	for _, f := range zr.File {
		if filepath.Base(f.Name) == name && !f.FileInfo().IsDir() {
			rc, err := f.Open()
			if err != nil {
				return nil, fmt.Errorf("open zip entry: %w", err)
			}
			defer rc.Close()

			data, err := io.ReadAll(rc)
			if err != nil {
				return nil, fmt.Errorf("read binary: %w", err)
			}
			return data, nil
		}
	}
	return nil, fmt.Errorf("binary %q not found in archive", name)
}
