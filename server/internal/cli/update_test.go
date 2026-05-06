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
			name:    "darwin arm64 versioned then legacy",
			tagName: "v0.2.30",
			goos:    "darwin",
			goarch:  "arm64",
			wantAssets: []string{
				"multicacan-cli-0.2.30-darwin-arm64.tar.gz",
				"multicacan_darwin_arm64.tar.gz",
			},
		},
		{
			name:    "linux amd64 with v prefix stripped",
			tagName: "v1.2.3",
			goos:    "linux",
			goarch:  "amd64",
			wantAssets: []string{
				"multicacan-cli-1.2.3-linux-amd64.tar.gz",
				"multicacan_linux_amd64.tar.gz",
			},
		},
		{
			name:    "windows uses zip",
			tagName: "v1.0.0",
			goos:    "windows",
			goarch:  "amd64",
			wantAssets: []string{
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
	t.Run("prefers versioned archive", func(t *testing.T) {
		assets := []GitHubReleaseAsset{
			{Name: "multicacan-cli-0.2.30-darwin-arm64.tar.gz", BrowserDownloadURL: "versioned"},
			{Name: "multicacan_darwin_arm64.tar.gz", BrowserDownloadURL: "legacy"},
		}
		got, err := findReleaseAsset(assets, "v0.2.30", "darwin", "arm64")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got.BrowserDownloadURL != "versioned" {
			t.Fatalf("expected versioned asset, got %q", got.Name)
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
		{"uses default for zero", 0, DefaultUpdateDownloadTimeout},
		{"uses default for negative", -1 * time.Second, DefaultUpdateDownloadTimeout},
		{"keeps explicit timeout", 10 * time.Minute, 10 * time.Minute},
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
