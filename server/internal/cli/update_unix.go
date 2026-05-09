//go:build !windows

package cli

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"
)

// replaceBinary swaps the running executable for the freshly-downloaded one.
// On Unix, the kernel keeps the old inode alive for the running process, so a
// plain rename is safe.
//
// On macOS, when the binary lives in a root-owned directory (e.g.
// /usr/local/bin), the rename will fail with EPERM/EACCES. We fall back to
// osascript with administrator privileges, which shows a macOS auth dialog
// and lets the user approve the replacement without needing a terminal.
func replaceBinary(tmpPath, exePath string) error {
	err := os.Rename(tmpPath, exePath)
	if err == nil {
		return nil
	}
	if runtime.GOOS == "darwin" && isPermissionError(err) {
		return replaceBinaryViaOsascript(tmpPath, exePath)
	}
	return err
}

func isPermissionError(err error) bool {
	return errors.Is(err, os.ErrPermission) || strings.Contains(err.Error(), "permission denied") || strings.Contains(err.Error(), "operation not permitted")
}

// replaceBinaryViaOsascript runs the mv + chmod via osascript so macOS shows
// a native authentication dialog. This lets panel-triggered updates work even
// when the binary is in /usr/local/bin (root-owned).
func replaceBinaryViaOsascript(tmpPath, exePath string) error {
	// Single-quote shell-escaping: replace ' with '\'' inside the path.
	sq := func(s string) string {
		return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
	}
	shellCmd := fmt.Sprintf("mv %s %s && chmod 755 %s",
		sq(tmpPath), sq(exePath), sq(exePath))
	script := fmt.Sprintf(`do shell script %s with administrator privileges`, sq(shellCmd))

	out, e := exec.Command("osascript", "-e", script).CombinedOutput()
	if e != nil {
		return fmt.Errorf("osascript elevation failed (%w): %s", e, strings.TrimSpace(string(out)))
	}
	return nil
}

// CleanupStaleUpdateArtifacts is a no-op on Unix — there are no sidecar files
// to reclaim.
func CleanupStaleUpdateArtifacts() {}
