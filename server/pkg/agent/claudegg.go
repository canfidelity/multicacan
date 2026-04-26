package agent

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"regexp"
	"strings"
	"time"
)

// claudeggBackend implements Backend by making direct HTTP requests to
// the claude.gg OpenAI-compatible API. No subprocess is spawned.
//
// Configure via the agent's custom_env:
//
//	CLAUDE_GG_API_KEY  — required; API key (Bearer token)
//	CLAUDE_GG_BASE_URL — optional; override base URL (default: https://claude.gg)
type claudeggBackend struct {
	cfg Config
}

// Tool call patterns that Claude models emit as text when no native tool API is used.
var (
	// <tool_call>{"name":"bash","arguments":{"command":"..."}}</tool_call>
	reToolCall = regexp.MustCompile(`(?s)<tool_call>\s*(.*?)\s*</tool_call>`)
	// <tool_use>{"name":"bash","input":{"command":"..."}}</tool_use>
	reToolUse = regexp.MustCompile(`(?s)<tool_use>\s*(.*?)\s*</tool_use>`)
	// Strip all tool markup from final clean output shown to users.
	reAllToolMarkup = regexp.MustCompile(`(?s)<(tool_call|tool_use|tool_response|tool_result|antml:function_calls|function_calls)[^>]*>.*?</(tool_call|tool_use|tool_response|tool_result|antml:function_calls|function_calls)>`)
)

type parsedToolCall struct {
	Name      string
	Arguments map[string]any
}

// parseToolCalls extracts tool calls from the model's text output.
// Handles both <tool_call> (OpenAI-style) and <tool_use> (Claude-style) formats.
func parseToolCalls(text string) []parsedToolCall {
	var calls []parsedToolCall

	for _, re := range []*regexp.Regexp{reToolCall, reToolUse} {
		for _, match := range re.FindAllStringSubmatch(text, -1) {
			if len(match) < 2 {
				continue
			}
			var data struct {
				Name      string         `json:"name"`
				Arguments map[string]any `json:"arguments"`
				Input     map[string]any `json:"input"`
			}
			if err := json.Unmarshal([]byte(match[1]), &data); err != nil {
				continue
			}
			args := data.Arguments
			if args == nil {
				args = data.Input
			}
			calls = append(calls, parsedToolCall{Name: data.Name, Arguments: args})
		}
	}
	return calls
}

// executeTool runs a tool call and returns the output string.
// Only "bash" is supported; unknown tools return an error message.
func executeTool(tc parsedToolCall, cwd string, env map[string]string, timeout time.Duration) string {
	if tc.Name != "bash" {
		return fmt.Sprintf("Error: unknown tool %q", tc.Name)
	}

	command, _ := tc.Arguments["command"].(string)
	if command == "" {
		return "Error: bash tool requires a non-empty 'command' argument"
	}

	const maxToolTimeout = 2 * time.Minute
	if timeout <= 0 || timeout > maxToolTimeout {
		timeout = maxToolTimeout
	}

	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, "bash", "-c", command)
	if cwd != "" {
		cmd.Dir = cwd
	}

	// Propagate custom environment variables alongside the inherited process env.
	if len(env) > 0 {
		cmd.Env = append(os.Environ(), envMapToSlice(env)...)
	}

	const maxOutputBytes = 64 * 1024
	out, err := cmd.CombinedOutput()
	if ctx.Err() == context.DeadlineExceeded {
		return fmt.Sprintf("Error: command timed out after %s\n%s", timeout, truncate(string(out), maxOutputBytes))
	}
	output := truncate(string(out), maxOutputBytes)
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

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "\n... (truncated)"
}

// stripToolMarkup removes all tool call/response XML blocks from text,
// returning only the clean prose that should be posted as a comment.
func stripToolMarkup(text string) string {
	cleaned := reAllToolMarkup.ReplaceAllString(text, "")
	for strings.Contains(cleaned, "\n\n\n") {
		cleaned = strings.ReplaceAll(cleaned, "\n\n\n", "\n\n")
	}
	return strings.TrimSpace(cleaned)
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

	msgCh := make(chan Message, 256)
	resCh := make(chan Result, 1)

	go func() {
		defer close(msgCh)
		defer close(resCh)

		startTime := time.Now()

		runCtx, cancel := context.WithTimeout(ctx, timeout)
		defer cancel()

		messages := buildClaudeGGMessages(opts.SystemPrompt, prompt)

		var (
			totalUsage  TokenUsage
			finalOutput string
			finalStatus = "completed"
			finalError  string
		)

		trySend(msgCh, Message{Type: MessageStatus, Status: "running"})

		for turn := 0; turn < maxTurns; turn++ {
			responseText, usage, err := b.doTurn(runCtx, messages, model, baseURL, apiKey, msgCh)
			totalUsage.InputTokens += usage.InputTokens
			totalUsage.OutputTokens += usage.OutputTokens

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

			toolCalls := parseToolCalls(responseText)

			if len(toolCalls) == 0 {
				// No tool calls — this is the final answer.
				finalOutput = stripToolMarkup(responseText)
				break
			}

			// Emit tool-use messages so the UI can show progress.
			for _, tc := range toolCalls {
				trySend(msgCh, Message{
					Type:  MessageToolUse,
					Tool:  tc.Name,
					Input: tc.Arguments,
				})
			}

			// Append the assistant's raw response (including tool call markup)
			// so the model sees its own output in the next turn.
			messages = append(messages, map[string]any{
				"role":    "assistant",
				"content": responseText,
			})

			// Execute each tool call and collect results.
			var toolResultsBuilder strings.Builder
			for i, tc := range toolCalls {
				result := executeTool(tc, opts.Cwd, b.cfg.Env, 2*time.Minute)
				trySend(msgCh, Message{
					Type:   MessageToolResult,
					Tool:   tc.Name,
					Output: result,
				})
				if i > 0 {
					toolResultsBuilder.WriteString("\n")
				}
				fmt.Fprintf(&toolResultsBuilder, "<tool_response>\n%s\n</tool_response>", result)
			}

			// Feed tool results back as a user message.
			messages = append(messages, map[string]any{
				"role":    "user",
				"content": toolResultsBuilder.String(),
			})
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

// doTurn makes one HTTP request to the claude.gg API and streams the response.
// Returns the full response text and token usage.
func (b *claudeggBackend) doTurn(ctx context.Context, messages []map[string]any, model, baseURL, apiKey string, msgCh chan<- Message) (string, TokenUsage, error) {
	reqBody, err := json.Marshal(map[string]any{
		"model":    model,
		"messages": messages,
		"stream":   true,
	})
	if err != nil {
		return "", TokenUsage{}, fmt.Errorf("claude-gg: marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		baseURL+"/v1/chat/completions", bytes.NewReader(reqBody))
	if err != nil {
		return "", TokenUsage{}, fmt.Errorf("claude-gg: create request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "text/event-stream")

	b.cfg.Logger.Info("claude-gg request", "model", model, "base_url", baseURL, "messages", len(messages))

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", TokenUsage{}, fmt.Errorf("claude-gg: HTTP request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return "", TokenUsage{}, fmt.Errorf("claude-gg: HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var (
		output strings.Builder
		usage  TokenUsage
	)

	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 4*1024*1024)

	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		data := strings.TrimPrefix(line, "data: ")
		if data == "[DONE]" {
			break
		}

		var chunk claudeGGChunk
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			continue
		}

		if chunk.Usage != nil {
			usage.InputTokens = chunk.Usage.PromptTokens
			usage.OutputTokens = chunk.Usage.CompletionTokens
		}

		for _, choice := range chunk.Choices {
			if choice.Delta.Content == "" {
				continue
			}
			output.WriteString(choice.Delta.Content)
			trySend(msgCh, Message{Type: MessageText, Content: choice.Delta.Content})
		}
	}

	if err := scanner.Err(); err != nil {
		return output.String(), usage, fmt.Errorf("claude-gg: read stream: %w", err)
	}

	return output.String(), usage, nil
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

// claudeGGChunk is a single SSE chunk from the OpenAI-compatible stream.
type claudeGGChunk struct {
	Choices []claudeGGChoice `json:"choices"`
	Usage   *claudeGGUsage   `json:"usage,omitempty"`
}

type claudeGGChoice struct {
	Delta claudeGGDelta `json:"delta"`
}

type claudeGGDelta struct {
	Content string `json:"content"`
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
