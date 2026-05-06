//go:build !windows

package daemon

import (
	"context"
	"fmt"
	"net/url"
	"os/exec"
	"strings"
	"syscall"
	"time"
)

const sshTunnelRemotePort = 2222

// sshTunnelLoop maintains a persistent reverse SSH tunnel from this Mac Mini
// to the VPS. The VPS uses the exposed port to mount the daemon's local
// filesystem via SSHFS, which openvscode-server then opens for browser-based
// IDE access.
//
// Topology:
//
//	Mac Mini ──ssh -R 2222:localhost:22──► VPS
//	VPS ──sshfs -p 2222 user@127.0.0.1:/multica_workspaces──► /mnt/macmini
//	browser ──/api/ide/*──► VPS (openvscode-server proxy)
func (d *Daemon) sshTunnelLoop(ctx context.Context) {
	vpsHost, err := extractVPSHost(d.cfg.ServerBaseURL)
	if err != nil || vpsHost == "" {
		d.logger.Debug("ssh tunnel: cannot parse VPS host, tunnel disabled", "error", err)
		return
	}

	backoff := 2 * time.Second
	for {
		if ctx.Err() != nil {
			return
		}
		if err := d.runSSHTunnel(ctx, vpsHost); err != nil && ctx.Err() == nil {
			d.logger.Debug("ssh tunnel: disconnected, retrying",
				"vps", vpsHost, "error", err, "retry_in", backoff)
		}
		if ctx.Err() != nil {
			return
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(backoff):
		}
		if backoff < 30*time.Second {
			backoff *= 2
			if backoff > 30*time.Second {
				backoff = 30 * time.Second
			}
		}
	}
}

func (d *Daemon) runSSHTunnel(ctx context.Context, vpsHost string) error {
	cmd := exec.CommandContext(ctx, "ssh",
		"-N",
		"-R", fmt.Sprintf("%d:localhost:22", sshTunnelRemotePort),
		"-o", "StrictHostKeyChecking=no",
		"-o", "UserKnownHostsFile=/dev/null",
		"-o", "ServerAliveInterval=10",
		"-o", "ServerAliveCountMax=3",
		"-o", "ExitOnForwardFailure=yes",
		"root@"+vpsHost,
	)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}

	d.logger.Info("ssh tunnel: starting reverse tunnel",
		"vps", vpsHost, "remote_port", sshTunnelRemotePort)
	return cmd.Run()
}

func extractVPSHost(rawURL string) (string, error) {
	u, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil {
		return "", err
	}
	return u.Hostname(), nil
}
