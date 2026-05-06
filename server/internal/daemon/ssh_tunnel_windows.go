//go:build windows

package daemon

import "context"

func (d *Daemon) sshTunnelLoop(_ context.Context) {}
