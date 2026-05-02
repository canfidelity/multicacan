package daemon

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
)

// serveSimState mirrors the JSON written by serve-sim.
type serveSimState struct {
	PID  int `json:"pid"`
	Port int `json:"port"`
}

// readServeSimStates returns running serve-sim instances.
func readServeSimStates() []serveSimState {
	var states []serveSimState
	dirs := []string{filepath.Join(os.TempDir(), "serve-sim")}
	if envTmp := os.Getenv("TMPDIR"); envTmp != "" && envTmp != os.TempDir() {
		dirs = append(dirs, filepath.Join(envTmp, "serve-sim"))
	}
	matches, _ := filepath.Glob("/var/folders/*/*/T/serve-sim")
	dirs = append(dirs, matches...)
	for _, stateDir := range dirs {
		states = append(states, readServeSimStatesFromDir(stateDir)...)
	}
	return states
}

func readServeSimStatesFromDir(stateDir string) []serveSimState {
	entries, err := os.ReadDir(stateDir)
	if err != nil {
		return nil
	}
	var states []serveSimState
	for _, e := range entries {
		if !strings.HasPrefix(e.Name(), "server-") || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		data, err := os.ReadFile(filepath.Join(stateDir, e.Name()))
		if err != nil {
			continue
		}
		var s serveSimState
		if err := json.Unmarshal(data, &s); err != nil {
			continue
		}
		// Check process alive.
		proc, err := os.FindProcess(s.PID)
		if err != nil {
			continue
		}
		if err := proc.Signal(syscall.Signal(0)); err != nil {
			os.Remove(filepath.Join(stateDir, e.Name()))
			continue
		}
		states = append(states, s)
	}
	return states
}

// ensureServeSim starts serve-sim if it's not already running.
// Returns the PID of the spawned process, or 0 if already running or unavailable.
func (d *Daemon) ensureServeSim() int {
	if runtime.GOOS != "darwin" {
		return 0
	}

	// Already running?
	if states := readServeSimStates(); len(states) > 0 {
		d.logger.Info("serve-sim already running", "pid", states[0].PID, "port", states[0].Port)
		return 0
	}

	// Find serve-sim binary.
	serveSimPath, err := exec.LookPath("serve-sim")
	if err != nil {
		// Try bunx as fallback.
		bunPath, bunErr := exec.LookPath("bunx")
		if bunErr != nil {
			d.logger.Debug("serve-sim not found on PATH, skipping auto-start")
			return 0
		}
		serveSimPath = bunPath
	}

	// Check if any simulator is booted.
	simctl, err := exec.Command("xcrun", "simctl", "list", "devices", "booted", "-j").Output()
	if err != nil {
		d.logger.Debug("no Xcode simulator available", "error", err)
		return 0
	}

	var simData struct {
		Devices map[string][]struct {
			UDID  string `json:"udid"`
			State string `json:"state"`
		} `json:"devices"`
	}
	if err := json.Unmarshal(simctl, &simData); err != nil {
		return 0
	}

	hasBooted := false
	for _, devs := range simData.Devices {
		for _, d := range devs {
			if d.State == "Booted" {
				hasBooted = true
				break
			}
		}
		if hasBooted {
			break
		}
	}
	if !hasBooted {
		d.logger.Debug("no booted simulator found, skipping serve-sim auto-start")
		return 0
	}

	// Start serve-sim detached.
	var cmd *exec.Cmd
	if strings.HasSuffix(serveSimPath, "bunx") {
		cmd = exec.Command(serveSimPath, "serve-sim", "--detach")
	} else {
		cmd = exec.Command(serveSimPath, "--detach")
	}
	cmd.Stdout = nil
	cmd.Stderr = nil

	if err := cmd.Run(); err != nil {
		d.logger.Warn("failed to start serve-sim", "error", err)
		return 0
	}

	// Re-read state to get PID.
	states := readServeSimStates()
	if len(states) > 0 {
		d.logger.Info("serve-sim started", "pid", states[0].PID, "port", states[0].Port)
		return states[0].PID
	}

	d.logger.Warn("serve-sim started but no state file found")
	return 0
}

// stopServeSim sends SIGTERM to the serve-sim process.
func (d *Daemon) stopServeSim(pid int) {
	proc, err := os.FindProcess(pid)
	if err != nil {
		return
	}
	if err := proc.Signal(syscall.SIGTERM); err != nil {
		d.logger.Debug("serve-sim already stopped", "pid", pid)
		return
	}
	d.logger.Info("serve-sim stopped", "pid", pid)
}
