package main

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var taskCmd = &cobra.Command{
	Use:   "task",
	Short: "Manage agent tasks",
}

var taskHandoffCmd = &cobra.Command{
	Use:   "handoff",
	Short: "Hand off the current task to another agent",
	Long: `Register a handoff from the current running task to a named or UUID-identified
agent. The new task is created automatically when the current task completes.

The target agent receives the handoff context injected into its prompt so it
can continue seamlessly from where you left off.

This command is intended to be called by agents during task execution.
MULTICACAN_TASK_ID must be set in the environment (set automatically by the daemon).`,
	Example: `  multicacan task handoff --to team-lead --context "Login screen done, PR #42 open"
  multicacan task handoff --to backend-dev --context "Need /api/login endpoint: POST {email, token} → {jwt}"`,
	RunE: runTaskHandoff,
}

func init() {
	taskHandoffCmd.Flags().String("to", "", "Target agent name or UUID (required)")
	taskHandoffCmd.Flags().String("context", "", "Context for the next agent (what you did, what they need to do)")
	_ = taskHandoffCmd.MarkFlagRequired("to")

	taskCmd.AddCommand(taskHandoffCmd)
}

func runTaskHandoff(cmd *cobra.Command, _ []string) error {
	taskID := os.Getenv("MULTICACAN_TASK_ID")
	if taskID == "" {
		return fmt.Errorf("MULTICACAN_TASK_ID is not set — this command must be run inside a daemon task")
	}

	to, _ := cmd.Flags().GetString("to")
	context, _ := cmd.Flags().GetString("context")

	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}

	var result map[string]any
	if err := client.PostJSON(cmd.Context(), "/api/daemon/tasks/"+taskID+"/handoff", map[string]string{
		"to":      to,
		"context": context,
	}, &result); err != nil {
		return fmt.Errorf("handoff failed: %w", err)
	}

	fmt.Fprintf(cmd.OutOrStdout(), "✓ Handoff registered → %s\n", to)
	if context != "" {
		fmt.Fprintf(cmd.OutOrStdout(), "  Context: %s\n", context)
	}
	return nil
}
