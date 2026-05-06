//go:build windows

package daemon

import "context"

func (d *Daemon) nativeIDELoop(_ context.Context) {}
