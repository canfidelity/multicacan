package daemon

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

const (
	pairPollInterval = 20 * time.Second
	maxDiffBytes     = 8000 // truncate very large diffs before sending to agent
)

// pairSessionLoop polls active pair sessions for all registered runtimes and
// drives the git-diff → agent-analysis → suggestion cycle.
func (d *Daemon) pairSessionLoop(ctx context.Context) {
	ticker := time.NewTicker(pairPollInterval)
	defer ticker.Stop()

	// track which sessions we've already claimed (registered work_dir)
	claimed := make(map[string]string) // sessionID → workDir

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			d.tickPairSessions(ctx, claimed)
		}
	}
}

func (d *Daemon) tickPairSessions(ctx context.Context, claimed map[string]string) {
	runtimeIDs := d.allRuntimeIDs()
	seen := make(map[string]bool)

	for _, rtID := range runtimeIDs {
		pollCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
		sessions, err := d.client.ListActivePairSessions(pollCtx, rtID)
		cancel()
		if err != nil {
			d.logger.Warn("pair: list sessions failed", "runtime_id", rtID, "error", err)
			continue
		}

		for _, s := range sessions {
			seen[s.ID] = true
			workDir, ok := claimed[s.ID]
			if !ok {
				// Try to find a suitable work_dir for this session.
				// Fall back to the daemon's workspace root + issue subdirectory.
				workDir = d.findPairWorkDir(s)
				if workDir == "" {
					d.logger.Debug("pair: no work_dir for session", "session_id", s.ID, "issue_id", s.IssueID)
					continue
				}

				claimCtx, claimCancel := context.WithTimeout(ctx, 5*time.Second)
				if err := d.client.ClaimPairSession(claimCtx, s.ID, workDir); err != nil {
					claimCancel()
					d.logger.Warn("pair: claim session failed", "session_id", s.ID, "error", err)
					continue
				}
				claimCancel()
				claimed[s.ID] = workDir
				d.logger.Info("pair: claimed session", "session_id", s.ID, "work_dir", workDir)
			}

			// Run git diff to detect changes.
			diff := gitDiff(workDir)
			if diff == "" {
				continue
			}

			diffHash := hashString(diff)
			if s.LastDiffHash != nil && *s.LastDiffHash == diffHash {
				continue // nothing new
			}

			if len(diff) > maxDiffBytes {
				diff = diff[:maxDiffBytes] + "\n... (truncated)"
			}

			// Ask the configured agent for an analysis.
			analysis := d.analyzeDiff(ctx, s, workDir, diff)
			if analysis == "" {
				analysis = "(no analysis available)"
			}

			postCtx, postCancel := context.WithTimeout(ctx, 10*time.Second)
			// Always post suggestion so the user sees it in the sidebar.
			postErr := d.client.PostPairSuggestion(postCtx, s.ID, diff, analysis, diffHash)
			if postErr != nil {
				d.logger.Warn("pair: post suggestion failed", "session_id", s.ID, "error", postErr)
			} else {
				d.logger.Info("pair: posted", "session_id", s.ID, "intervene", s.Intervene, "diff_bytes", len(diff))
			}
			// If intervene mode, also send the analysis to the running agent.
			if s.Intervene {
				if err := d.client.PostPairIntervention(postCtx, s.ID, s.IssueID, analysis); err != nil {
					d.logger.Warn("pair: post intervention failed", "session_id", s.ID, "error", err)
				}
			}
			postCancel()
		}
	}

	// Clean up claimed sessions that are no longer active.
	for id := range claimed {
		if !seen[id] {
			delete(claimed, id)
		}
	}
}

// findPairWorkDir tries to find a local git working directory for a pair session.
// It looks for any workspace directory that contains a git repo.
func (d *Daemon) findPairWorkDir(s PairSession) string {
	// If the session already has a work_dir set by the server, use it.
	if s.WorkDir != nil && *s.WorkDir != "" {
		return *s.WorkDir
	}
	if s.TaskWorkDir != "" {
		return s.TaskWorkDir
	}

	// Check in-memory map for actively running tasks (work_dir isn't in DB until completion).
	d.activeTaskWorkDirsMu.RLock()
	if wd, ok := d.activeTaskWorkDirs[s.IssueID]; ok && wd != "" {
		d.activeTaskWorkDirsMu.RUnlock()
		return wd
	}
	d.activeTaskWorkDirsMu.RUnlock()

	// Walk the daemon's workspaces root looking for a git repo linked to this issue.
	if d.cfg.WorkspacesRoot == "" {
		return ""
	}

	d.mu.Lock()
	wsIDs := make([]string, 0, len(d.workspaces))
	for id := range d.workspaces {
		wsIDs = append(wsIDs, id)
	}
	d.mu.Unlock()

	// Walk each workspace dir and check .gc_meta.json for the matching issue ID.
	// work_dir is only written to DB on task completion, so we must scan locally
	// to find the workdir for an actively running task.
	for _, wsID := range wsIDs {
		wsPath := filepath.Join(d.cfg.WorkspacesRoot, wsID)
		entries, err := os.ReadDir(wsPath)
		if err != nil {
			continue
		}
		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}
			metaPath := filepath.Join(wsPath, entry.Name(), ".gc_meta.json")
			data, err := os.ReadFile(metaPath)
			if err != nil {
				continue
			}
			var meta struct {
				IssueID string `json:"issue_id"`
			}
			if err := json.Unmarshal(data, &meta); err != nil {
				continue
			}
			if meta.IssueID == s.IssueID {
				candidate := filepath.Join(wsPath, entry.Name(), "workdir")
				if _, err := os.Stat(candidate); err == nil {
					return candidate
				}
			}
		}
	}

	return ""
}

// gitDiff runs `git status --short` + `git diff HEAD` in workDir and returns
// the combined output. Returns empty string on error or when there are no changes.
func gitDiff(workDir string) string {
	if workDir == "" {
		return ""
	}

	// If it's a git repo, use git diff
	if isGitRepo(workDir) {
		statusOut, err := runGit(workDir, "status", "--short")
		if err != nil || strings.TrimSpace(statusOut) == "" {
			staged, _ := runGit(workDir, "diff", "--cached", "--stat")
			if strings.TrimSpace(staged) == "" {
				return ""
			}
		}
		diff, _ := runGit(workDir, "diff", "HEAD")
		if strings.TrimSpace(diff) == "" {
			diff, _ = runGit(workDir, "diff", "--cached")
		}
		return diff
	}

	// Fallback: find agent's active project dir by scanning open files via lsof.
	// Agents (hermes, claude, opencode) may write to arbitrary paths outside workdir.
	if diff := diffFromAgentFiles(workDir); diff != "" {
		return diff
	}
	return ""
}

func runGit(workDir string, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Dir = workDir
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		return "", err
	}
	return out.String(), nil
}

func isGitRepo(dir string) bool {
	_, err := runGit(dir, "rev-parse", "--git-dir")
	return err == nil
}

// diffFromAgentFiles uses lsof to find files the running agent processes have open,
// determines the active project directory, and returns a diff/status for it.
func diffFromAgentFiles(workDir string) string {
	// Agent process names to check (the binaries that run agent code).
	agentProcs := []string{"hermes", "claude", "opencode", "node", "python3"}

	seenDirs := make(map[string]bool)
	homeDir, _ := os.UserHomeDir()

	for _, proc := range agentProcs {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		out, err := exec.CommandContext(ctx, "lsof", "-c", proc, "-Fn", "-a", "-d", "cwd").Output()
		cancel()
		if err != nil || len(out) == 0 {
			continue
		}
		// lsof -Fn output: lines starting with 'n' are paths
		for _, line := range strings.Split(string(out), "\n") {
			if !strings.HasPrefix(line, "n") {
				continue
			}
			dir := strings.TrimPrefix(line, "n")
			// Skip daemon's own workdir, system dirs, and hidden dirs
			if dir == workDir || strings.HasPrefix(dir, "/System") ||
				strings.HasPrefix(dir, "/usr/") || strings.HasPrefix(dir, "/private/tmp/com.apple") ||
				strings.Contains(dir, "multica_workspaces") || strings.Contains(dir, ".hermes") {
				continue
			}
			// Only consider dirs inside home or /tmp
			if homeDir != "" && !strings.HasPrefix(dir, homeDir) && !strings.HasPrefix(dir, "/tmp") {
				continue
			}
			if !seenDirs[dir] {
				seenDirs[dir] = true
				if isGitRepo(dir) {
					if diff := gitRepoStatus(dir); diff != "" {
						return diff
					}
				}
			}
		}
	}

	// Also check recently modified files in workdir and /tmp as last resort.
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	searchDirs := []string{workDir, "/tmp"}
	var combined bytes.Buffer
	for _, dir := range searchDirs {
		if _, err := os.Stat(dir); err != nil {
			continue
		}
		cmd := exec.CommandContext(ctx, "find", dir,
			"-type", "f",
			"-not", "-path", "*/.git/*",
			"-not", "-name", "*.log",
			"-not", "-path", "*/.*",
			"-mmin", "-3",
		)
		var out bytes.Buffer
		cmd.Stdout = &out
		if err := cmd.Run(); err == nil && strings.TrimSpace(out.String()) != "" {
			combined.WriteString(out.String())
		}
	}
	if combined.Len() == 0 {
		return ""
	}
	lines := strings.Split(strings.TrimSpace(combined.String()), "\n")
	var diffBuf bytes.Buffer
	diffBuf.WriteString("Recently modified files:\n")
	for _, path := range lines {
		path = strings.TrimSpace(path)
		if path == "" {
			continue
		}
		diffBuf.WriteString("  " + path + "\n")
		data, err := os.ReadFile(path)
		if err == nil && len(data) > 0 && len(data) < 4000 {
			diffBuf.WriteString("```\n")
			diffBuf.Write(data)
			diffBuf.WriteString("\n```\n")
		}
	}
	return diffBuf.String()
}

// gitRepoStatus returns git status + diff for any git repo, including untracked files.
func gitRepoStatus(repoDir string) string {
	statusOut, err := runGit(repoDir, "status", "--short")
	if err != nil || strings.TrimSpace(statusOut) == "" {
		return ""
	}
	var buf bytes.Buffer
	buf.WriteString(fmt.Sprintf("Git repo: %s\n", repoDir))
	buf.WriteString("Status:\n```\n")
	buf.WriteString(statusOut)
	buf.WriteString("```\n")
	// Include diff of tracked changes
	if diff, _ := runGit(repoDir, "diff", "HEAD"); strings.TrimSpace(diff) != "" {
		if len(diff) > 6000 {
			diff = diff[:6000] + "\n... (truncated)"
		}
		buf.WriteString("Diff:\n```diff\n")
		buf.WriteString(diff)
		buf.WriteString("\n```\n")
	}
	return buf.String()
}

func hashString(s string) string {
	h := sha256.Sum256([]byte(s))
	return fmt.Sprintf("%x", h[:8])
}

// pairAgentPreference defines the order in which agents are preferred for pair analysis.
var pairAgentPreference = []string{"hermes", "claude", "opencode", "openclaw", "codex", "gemini", "copilot", "kimi", "kiro", "cursor", "pi"}

// analyzeDiff invokes an available agent binary with a pair programming
// prompt and returns the text response. Falls back to empty string if no agent
// is configured or the invocation fails.
func (d *Daemon) analyzeDiff(ctx context.Context, s PairSession, workDir, diff string) string {
	// Pick agent by preference order so we use the best available CLI.
	agentName := ""
	agentPath := ""
	for _, name := range pairAgentPreference {
		if entry, ok := d.cfg.Agents[name]; ok && entry.Path != "" {
			agentName = name
			agentPath = entry.Path
			break
		}
	}
	if agentPath == "" {
		return ""
	}

	prompt := buildPairPrompt(diff)
	args := pairAgentArgs(agentName, prompt)

	// Use a short timeout — this is background analysis, not a blocking task.
	analyzeCtx, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()

	var out bytes.Buffer
	cmd := exec.CommandContext(analyzeCtx, agentPath, args...)
	cmd.Dir = workDir
	cmd.Stdout = &out

	if err := cmd.Run(); err != nil {
		d.logger.Debug("pair: agent analysis failed", "agent", agentName, "error", err)
		return ""
	}

	result := strings.TrimSpace(out.String())
	if len(result) > 4000 {
		result = result[:4000]
	}
	return result
}

// pairAgentArgs returns the correct CLI arguments for non-interactive prompt execution per agent type.
func pairAgentArgs(agentName, prompt string) []string {
	switch agentName {
	case "hermes":
		return []string{"-z", prompt, "--yolo"}
	case "opencode":
		return []string{"run", prompt}
	default:
		// claude, openclaw, and others support --print
		return []string{"--print", prompt}
	}
}

func buildPairPrompt(diff string) string {
	return `You are a pair programming assistant reviewing a git diff. Provide a concise, actionable review:
- Point out potential bugs or issues
- Suggest improvements
- Note any missing error handling or edge cases
- Keep your response under 300 words

Git diff:
` + "```diff\n" + diff + "\n```"
}

// startPairLoop is called from daemon.Run() to start the background pair poller.
func (d *Daemon) startPairLoop(ctx context.Context) {
	go d.pairSessionLoop(ctx)
	slog.Info("pair: session loop started")
}