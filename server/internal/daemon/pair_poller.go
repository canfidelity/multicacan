package daemon

import (
	"bytes"
	"context"
	"crypto/sha256"
	"fmt"
	"log/slog"
	"os/exec"
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
			d.logger.Debug("pair: list sessions failed", "runtime_id", rtID, "error", err)
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
			err := d.client.PostPairSuggestion(postCtx, s.ID, diff, analysis, diffHash)
			postCancel()
			if err != nil {
				d.logger.Warn("pair: post suggestion failed", "session_id", s.ID, "error", err)
			} else {
				d.logger.Info("pair: posted suggestion", "session_id", s.ID, "diff_bytes", len(diff))
			}
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

	// Walk the daemon's workspaces root looking for a git repo linked to this issue.
	if d.cfg.WorkspacesRoot == "" {
		return ""
	}

	// Look for directories named by issueID under workspaces root.
	candidate := d.cfg.WorkspacesRoot + "/" + s.IssueID
	if isGitRepo(candidate) {
		return candidate
	}

	return ""
}

// gitDiff runs `git status --short` + `git diff HEAD` in workDir and returns
// the combined output. Returns empty string on error or when there are no changes.
func gitDiff(workDir string) string {
	if workDir == "" {
		return ""
	}

	// Status first (untracked + unstaged)
	statusOut, err := runGit(workDir, "status", "--short")
	if err != nil || strings.TrimSpace(statusOut) == "" {
		// No changes — also check staged
		staged, _ := runGit(workDir, "diff", "--cached", "--stat")
		if strings.TrimSpace(staged) == "" {
			return ""
		}
	}

	// Full diff (unstaged + staged)
	diff, _ := runGit(workDir, "diff", "HEAD")
	if strings.TrimSpace(diff) == "" {
		// Try just staged
		diff, _ = runGit(workDir, "diff", "--cached")
	}
	return diff
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

func hashString(s string) string {
	h := sha256.Sum256([]byte(s))
	return fmt.Sprintf("%x", h[:8])
}

// analyzeDiff invokes the first available agent binary with a pair programming
// prompt and returns the text response. Falls back to empty string if no agent
// is configured or the invocation fails.
func (d *Daemon) analyzeDiff(ctx context.Context, s PairSession, workDir, diff string) string {
	// Find the first configured agent binary.
	agentPath := ""
	agentName := ""
	for name, entry := range d.cfg.Agents {
		if entry.Path != "" {
			agentPath = entry.Path
			agentName = name
			break
		}
	}
	if agentPath == "" {
		return ""
	}

	prompt := buildPairPrompt(diff)

	// Use a short timeout — this is background analysis, not a blocking task.
	analyzeCtx, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()

	var out bytes.Buffer
	cmd := exec.CommandContext(analyzeCtx, agentPath, "--print", prompt)
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