package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"time"
)

// claudeggBackend implements Backend by making direct HTTP requests to
// the claude.gg OpenAI-compatible API. It runs a tool-execution loop that
// allows the model to execute bash commands (multica CLI, git, etc.) in the
// task working directory, mirroring the capability of subprocess-based agents.
//
// Configure via the agent's custom_env:
//
//	CLAUDE_GG_API_KEY  — required; API key (Bearer token)
//	CLAUDE_GG_BASE_URL — optional; override base URL (default: https://claude.gg)
type claudeggBackend struct {
	cfg Config
}

// claudeGGBashTool is the single tool exposed to the model: a bash executor.
var claudeGGBashTool = map[string]any{
	"type": "function",
	"function": map[string]any{
		"name":        "bash",
		"description": "Execute a bash command in the task working directory. Use this to run multica CLI commands, git operations, or any other shell operations needed to complete the task.",
		"parameters": map[string]any{
			"type": "object",
			"properties": map[string]any{
				"command": map[string]any{
					"type":        "string",
					"description": "The bash command to execute",
				},
			},
			"required": []string{"command"},
		},
	},
}

func (b *claudeggBackend) Execute(ctx context.Context, prompt string, opts ExecOptions) (*Session, error) {
	apiKey := b.cfg.Env["CLAUDE_GG_API_KEY"]
	if apiKey == "" {
		apiKey = b.cfg.Env["ANTHROPIC_API_KEY"]
	}
	if apiKey == "" {
		return nil, fmt.Errorf("claude-gg: CLAUDE_GG_API_KEY is not set in custom_env")
	}

	baseURL := b.cfg.Env["CLAUDE_GG_BASE_URL"]
	if baseURL == "" {
		baseURL = "https://claude.gg"
	}
	baseURL = strings.TrimRight(baseURL, "/")

	model := opts.Model
	if model == "" {
		model = "claude-sonnet-4-6"
	}

	timeout := opts.Timeout
	if timeout == 0 {
		timeout = 20 * time.Minute
	}

	maxTurns := opts.MaxTurns
	if maxTurns <= 0 {
		maxTurns = 20
	}

	messages := buildClaudeGGMessages(opts.SystemPrompt, prompt)

	msgCh := make(chan Message, 256)
	resCh := make(chan Result, 1)

	go func() {
		defer close(msgCh)
		defer close(resCh)

		startTime := time.Now()

		runCtx, cancel := context.WithTimeout(ctx, timeout)
		defer cancel()

		var (
			totalUsage  TokenUsage
			finalOutput string
			finalStatus = "completed"
			finalError  string
		)

		trySend(msgCh, Message{Type: MessageStatus, Status: "running"})

		// Tool-execution loop: each iteration calls the API, executes any tool
		// calls, feeds results back, and repeats until a text-only reply is produced.
		for turn := 0; turn < maxTurns; turn++ {
			b.cfg.Logger.Info("claude-gg turn", "turn", turn+1, "model", model, "base_url", baseURL, "messages", len(messages))

			apiResp, usage, err := b.callAPI(runCtx, messages, model, apiKey, baseURL)
			if usage != nil {
				totalUsage.InputTokens += usage.InputTokens
				totalUsage.OutputTokens += usage.OutputTokens
			}
			if err != nil {
				if runCtx.Err() == context.DeadlineExceeded {
					finalStatus = "timeout"
					finalError = fmt.Sprintf("claude-gg timed out after %s", timeout)
				} else if runCtx.Err() == context.Canceled {
					finalStatus = "aborted"
					finalError = "execution cancelled"
				} else {
					finalStatus = "failed"
					finalError = err.Error()
				}
				break
			}

			// Emit assistant text to the activity stream.
			if apiResp.Content != "" {
				trySend(msgCh, Message{Type: MessageText, Content: apiResp.Content})
			}

			// No tool calls → this is the model's final response.
			if len(apiResp.ToolCalls) == 0 || turn == maxTurns-1 {
				finalOutput = apiResp.Content
				break
			}

			// Add the assistant message (with tool_calls) to conversation history.
			messages = append(messages, map[string]any{
				"role":       "assistant",
				"content":    apiResp.Content,
				"tool_calls": apiResp.ToolCalls,
			})

			// Execute each tool call and collect results.
			for _, tc := range apiResp.ToolCalls {
				var inputArgs map[string]any
				_ = json.Unmarshal([]byte(tc.Function.Arguments), &inputArgs)

				trySend(msgCh, Message{
					Type:   MessageToolUse,
					Tool:   tc.Function.Name,
					CallID: tc.ID,
					Input:  inputArgs,
				})

				var toolOutput string
				switch tc.Function.Name {
				case "bash":
					var args struct {
						Command string `json:"command"`
					}
					if jsonErr := json.Unmarshal([]byte(tc.Function.Arguments), &args); jsonErr != nil {
						toolOutput = fmt.Sprintf("error parsing bash arguments: %v", jsonErr)
					} else {
						toolOutput = b.runBash(args.Command, opts.Cwd)
					}
				default:
					toolOutput = fmt.Sprintf("unknown tool %q — only \"bash\" is supported", tc.Function.Name)
				}

				trySend(msgCh, Message{
					Type:   MessageToolResult,
					Tool:   tc.Function.Name,
					CallID: tc.ID,
					Output: toolOutput,
				})

				messages = append(messages, map[string]any{
					"role":         "tool",
					"tool_call_id": tc.ID,
					"content":      toolOutput,
				})
			}
		}

		duration := time.Since(startTime)
		b.cfg.Logger.Info("claude-gg finished", "status", finalStatus, "turns", len(messages), "duration", duration.Round(time.Millisecond))

		var usageMap map[string]TokenUsage
		if totalUsage.InputTokens > 0 || totalUsage.OutputTokens > 0 {
			usageMap = map[string]TokenUsage{model: totalUsage}
		}

		resCh <- Result{
			Status:     finalStatus,
			Output:     finalOutput,
			Error:      finalError,
			DurationMs: duration.Milliseconds(),
			Usage:      usageMap,
		}
	}()

	return &Session{Messages: msgCh, Result: resCh}, nil
}

// claudeGGAPIResponse holds the parsed result of a single non-streaming API call.
type claudeGGAPIResponse struct {
	Content   string
	ToolCalls []claudeGGToolCall
}

// callAPI makes a single non-streaming request to the OpenAI-compatible endpoint.
func (b *claudeggBackend) callAPI(
	ctx context.Context,
	messages []map[string]any,
	model, apiKey, baseURL string,
) (*claudeGGAPIResponse, *TokenUsage, error) {
	reqBody, err := json.Marshal(map[string]any{
		"model":    model,
		"messages": messages,
		"tools":    []any{claudeGGBashTool},
		"stream":   false,
	})
	if err != nil {
		return nil, nil, fmt.Errorf("claude-gg: marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		baseURL+"/v1/chat/completions", bytes.NewReader(reqBody))
	if err != nil {
		return nil, nil, fmt.Errorf("claude-gg: create request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, nil, fmt.Errorf("claude-gg: HTTP request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, nil, fmt.Errorf("claude-gg: HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var raw claudeGGNonStreamResponse
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, nil, fmt.Errorf("claude-gg: decode response: %w", err)
	}
	if len(raw.Choices) == 0 {
		return nil, nil, fmt.Errorf("claude-gg: empty choices in response")
	}

	msg := raw.Choices[0].Message
	result := &claudeGGAPIResponse{
		Content:   msg.Content,
		ToolCalls: msg.ToolCalls,
	}

	var usage *TokenUsage
	if raw.Usage != nil {
		usage = &TokenUsage{
			InputTokens:  raw.Usage.PromptTokens,
			OutputTokens: raw.Usage.CompletionTokens,
		}
	}

	return result, usage, nil
}

// runBash executes a shell command in the given working directory and returns
// its combined stdout+stderr. Output is capped at 64 KiB. Custom env vars
// from the agent config are propagated alongside the inherited process env.
func (b *claudeggBackend) runBash(command, workDir string) string {
	const (
		maxOutput  = 64 * 1024
		cmdTimeout = 2 * time.Minute
	)

	preview := command
	if len(preview) > 120 {
		preview = preview[:120] + "..."
	}
	b.cfg.Logger.Info("claude-gg bash", "command", preview)

	ctx, cancel := context.WithTimeout(context.Background(), cmdTimeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, "bash", "-c", command)
	if workDir != "" {
		cmd.Dir = workDir
	}

	// Propagate custom environment variables alongside the inherited process env.
	if len(b.cfg.Env) > 0 {
		cmd.Env = append(os.Environ(), envMapToSlice(b.cfg.Env)...)
	}

	out, err := cmd.CombinedOutput()
	if ctx.Err() == context.DeadlineExceeded {
		return fmt.Sprintf("Error: command timed out after %s\n%s", cmdTimeout, truncateBytes(out, maxOutput))
	}
	output := truncateBytes(out, maxOutput)
	if err != nil && output == "" {
		return fmt.Sprintf("Error: %v", err)
	}
	return output
}

func envMapToSlice(m map[string]string) []string {
	s := make([]string, 0, len(m))
	for k, v := range m {
		s = append(s, k+"="+v)
	}
	return s
}

func truncateBytes(b []byte, n int) string {
	if len(b) <= n {
		return string(b)
	}
	return string(b[:n]) + "\n... (truncated)"
}

// buildClaudeGGMessages constructs the messages array for the chat completions request.
func buildClaudeGGMessages(systemPrompt, userPrompt string) []map[string]any {
	var msgs []map[string]any
	if systemPrompt != "" {
		msgs = append(msgs, map[string]any{
			"role":    "system",
			"content": systemPrompt,
		})
	}
	msgs = append(msgs, map[string]any{
		"role":    "user",
		"content": userPrompt,
	})
	return msgs
}

// --- Non-streaming response types ---

type claudeGGNonStreamResponse struct {
	Choices []claudeGGNonStreamChoice `json:"choices"`
	Usage   *claudeGGUsage            `json:"usage,omitempty"`
}

type claudeGGNonStreamChoice struct {
	Message      claudeGGAssistantMessage `json:"message"`
	FinishReason string                   `json:"finish_reason"`
}

type claudeGGAssistantMessage struct {
	Role      string             `json:"role"`
	Content   string             `json:"content"`
	ToolCalls []claudeGGToolCall `json:"tool_calls,omitempty"`
}

type claudeGGToolCall struct {
	ID       string               `json:"id"`
	Type     string               `json:"type"`
	Function claudeGGToolCallFunc `json:"function"`
}

type claudeGGToolCallFunc struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

type claudeGGUsage struct {
	PromptTokens     int64 `json:"prompt_tokens"`
	CompletionTokens int64 `json:"completion_tokens"`
}

// claudeGGStaticModels returns the known Claude models available via claude.gg.
func claudeGGStaticModels() []Model {
	return []Model{
		{ID: "claude-sonnet-4-6", Label: "Claude Sonnet 4.6", Provider: "claude.gg", Default: true},
		{ID: "claude-opus-4-6", Label: "Claude Opus 4.6", Provider: "claude.gg"},
		{ID: "claude-haiku-4-5-20251001", Label: "Claude Haiku 4.5", Provider: "claude.gg"},
		{ID: "claude-sonnet-4-5", Label: "Claude Sonnet 4.5", Provider: "claude.gg"},
	}
}
