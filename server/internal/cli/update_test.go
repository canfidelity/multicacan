package cli

import (
	"testing"
	"time"
)

func TestReleaseAssetCandidates(t *testing.T) {
	tests := []struct {
		name       string
		tagName    string
		goos       string
		goarch     string
		wantAssets []string
	}{
		{
			name:    "latest tag yields only raw binary",
			tagName: "latest",
			goos:    "darwin",
			goarch:  "arm64",
			wantAssets: []string{
				"multicacan-darwin-arm64",
			},
		},
		{
			name:    "semver tag yields raw binary then archives",
			tagName: "v0.2.30",
			goos:    "darwin",
			goarch:  "arm64",
			wantAssets: []string{
				"multicacan-darwin-arm64",
				"multicacan-cli-0.2.30-darwin-arm64.tar.gz",
				"multicacan_darwin_arm64.tar.gz",
			},
		},
		{
			name:    "linux semver tag",
			tagName: "v1.2.3",
			goos:    "linux",
			goarch:  "amd64",
			wantAssets: []string{
				"multicacan-linux-amd64",
				"multicacan-cli-1.2.3-linux-amd64.tar.gz",
				"multicacan_linux_amd64.tar.gz",
			},
		},
		{
			name:    "windows uses zip and .exe",
			tagName: "v1.0.0",
			goos:    "windows",
			goarch:  "amd64",
			wantAssets: []string{
				"multicacan-windows-amd64.exe",
				"multicacan-cli-1.0.0-windows-amd64.zip",
				"multicacan_windows_amd64.zip",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := releaseAssetCandidates(tt.tagName, tt.goos, tt.goarch)
			if len(got) != len(tt.wantAssets) {
				t.Fatalf("candidate count mismatch: got %v, want %v", got, tt.wantAssets)
			}
			for i := range got {
				if got[i] != tt.wantAssets[i] {
					t.Fatalf("candidate[%d] mismatch: got %q, want %q", i, got[i], tt.wantAssets[i])
				}
			}
		})
	}
}

func TestFindReleaseAsset(t *testing.T) {
	t.Run("prefers raw binary over archive", func(t *testing.T) {
		assets := []GitHubReleaseAsset{
			{Name: "multicacan-darwin-arm64", BrowserDownloadURL: "raw"},
			{Name: "multicacan-cli-0.2.30-darwin-arm64.tar.gz", BrowserDownloadURL: "archive"},
		}
		got, err := findReleaseAsset(assets, "v0.2.30", "darwin", "arm64")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got.BrowserDownloadURL != "raw" {
			t.Fatalf("expected raw binary, got %q", got.Name)
		}
	})

	t.Run("falls back to versioned archive when no raw binary", func(t *testing.T) {
		assets := []GitHubReleaseAsset{
			{Name: "multicacan-cli-0.2.30-linux-amd64.tar.gz", BrowserDownloadURL: "archive"},
		}
		got, err := findReleaseAsset(assets, "v0.2.30", "linux", "amd64")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got.Name != "multicacan-cli-0.2.30-linux-amd64.tar.gz" {
			t.Fatalf("asset mismatch: got %q", got.Name)
		}
	})

	t.Run("falls back to legacy archive", func(t *testing.T) {
		assets := []GitHubReleaseAsset{
			{Name: "multicacan_linux_amd64.tar.gz", BrowserDownloadURL: "legacy"},
		}
		got, err := findReleaseAsset(assets, "v0.2.30", "linux", "amd64")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got.Name != "multicacan_linux_amd64.tar.gz" {
			t.Fatalf("asset mismatch: got %q", got.Name)
		}
	})

	t.Run("returns error when no candidate matches", func(t *testing.T) {
		_, err := findReleaseAsset([]GitHubReleaseAsset{{Name: "checksums.txt"}}, "v1.0.0", "linux", "amd64")
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})
}

func TestUpdateDownloadTimeoutOrDefault(t *testing.T) {
	tests := []struct {
		name    string
		timeout time.Duration
		want    time.Duration
	}{
		{
			name:    "uses default for zero",
			timeout: 0,
			want:    DefaultUpdateDownloadTimeout,
		},
		{
			name:    "uses default for negative",
			timeout: -1 * time.Second,
			want:    DefaultUpdateDownloadTimeout,
		},
		{
			name:    "keeps explicit timeout",
			timeout: 10 * time.Minute,
			want:    10 * time.Minute,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := updateDownloadTimeoutOrDefault(tt.timeout)
			if got != tt.want {
				t.Fatalf("timeout = %s, want %s", got, tt.want)
			}
		})
	}
}
