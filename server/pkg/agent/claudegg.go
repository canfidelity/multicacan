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
	"sort"
	"strings"
	"time"
)

// extractXMLToolCalls parses <tool_call>...</tool_call> blocks that Claude models
// sometimes embed directly in the content field instead of using the structured
// OpenAI tool_calls field. Returns the text before the first tool call (the
// "prefix") and all parsed tool calls. Hallucinated <tool_response> blocks that
// the model generates between calls are silently dropped — we replace them with
// real execution results.
func extractXMLToolCalls(content string) (prefix string, calls []claudeGGToolCall) {
	const (
		startTag = "<tool_call>"
		endTag   = "</tool_call>"
	)

	firstIdx := strings.Index(content, startTag)
	if firstIdx == -1 {
		return content, nil
	}
	prefix = strings.TrimSpace(content[:firstIdx])

	s := content[firstIdx:]
	id := 0
	for {
		start := strings.Index(s, startTag)
		if start == -1 {
			break
		}
		end := strings.Index(s, endTag)
		if end == -1 || end < start {
			break
		}
		body := strings.TrimSpace(s[start+len(startTag) : end])
		s = s[end+len(endTag):]

		// Support two JSON shapes:
		//   {"name":"bash","arguments":{"command":"..."}}
		//   {"name":"bash","input":{"command":"..."}}
		var raw struct {
			Name      string          `json:"name"`
			Arguments json.RawMessage `json:"arguments"`
			Input     json.RawMessage `json:"input"`
		}
		if err := json.Unmarshal([]byte(body), &raw); err != nil {
			continue
		}
		args := raw.Arguments
		if len(args) == 0 {
			args = raw.Input
		}
		if len(args) == 0 {
			continue
		}
		calls = append(calls, claudeGGToolCall{
			ID:   fmt.Sprintf("xml-call-%d", id),
			Type: "function",
			Function: claudeGGToolCallFunc{
				Name:      raw.Name,
				Arguments: string(args),
			},
		})
		id++
	}
	return prefix, calls
}

// buildXMLAssistantContent reconstructs the assistant message content with
// tool calls in XML format (without hallucinated responses). This is used
// when feeding history back to a model that uses XML-style tool calling.
func buildXMLAssistantContent(prefix string, calls []claudeGGToolCall) string {
	var sb strings.Builder
	if prefix != "" {
		sb.WriteString(prefix)
	}
	for _, tc := range calls {
		sb.WriteString("\n<tool_call>\n")
		// Re-encode the call JSON cleanly.
		enc, _ := json.Marshal(map[string]any{
			"name":      tc.Function.Name,
			"arguments": json.RawMessage(tc.Function.Arguments),
		})
		sb.Write(enc)
		sb.WriteString("\n</tool_call>")
	}
	return sb.String()
}

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
		maxTurns = 50
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
			totalUsage      TokenUsage
			finalOutput     string
			lastTextContent string // last non-empty text seen across all turns
			finalStatus     = "completed"
			finalError      string
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

			// If the model returned neither text nor tool calls the API returned
			// an empty response — retry the same turn (don't advance conversation).
			if apiResp.Content == "" && len(apiResp.ToolCalls) == 0 {
				b.cfg.Logger.Warn("claude-gg: empty response, retrying turn", "turn", turn+1)
				select {
				case <-runCtx.Done():
				case <-time.After(5 * time.Second):
				}
				continue
			}

			// Emit assistant text to the activity stream and track it.
			if apiResp.Content != "" {
				trySend(msgCh, Message{Type: MessageText, Content: apiResp.Content})
				lastTextContent = apiResp.Content
			}

			// No tool calls → this is the model's final response.
			if len(apiResp.ToolCalls) == 0 || turn == maxTurns-1 {
				finalOutput = apiResp.Content
				// If the last turn produced no text (e.g. only tool calls), fall back
				// to the most recent non-empty text seen across all turns so the daemon
				// always has something to post as a result comment.
				if finalOutput == "" {
					finalOutput = lastTextContent
				}
				break
			}

			if apiResp.XMLFormat {
				// XML-style tool calls: the model used <tool_call> tags in content.
				// History must mirror this format — structured tool_calls / tool-role
				// messages are not used. Instead we append the assistant turn with
				// reconstructed XML (minus hallucinated responses) and then one user
				// message per tool result wrapped in <tool_response> tags.
				messages = append(messages, map[string]any{
					"role":    "assistant",
					"content": buildXMLAssistantContent(apiResp.Content, apiResp.ToolCalls),
				})

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
						"role":    "user",
						"content": "<tool_response>\n" + truncateBytes([]byte(toolOutput), historyLimit) + "\n</tool_response>",
					})
				}
			} else {
				// OpenAI-style structured tool_calls: append assistant message with
				// tool_calls field, then individual tool-role result messages.
				messages = append(messages, map[string]any{
					"role":       "assistant",
					"content":    apiResp.Content,
					"tool_calls": apiResp.ToolCalls,
				})

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
						"content":      truncateBytes([]byte(toolOutput), historyLimit),
					})
				}
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

// claudeGGAPIResponse holds the parsed result of a single API call.
type claudeGGAPIResponse struct {
	Content   string
	ToolCalls []claudeGGToolCall
	// XMLFormat is true when tool calls were extracted from inline XML tags in
	// the content field rather than from the structured tool_calls field. The
	// conversation history format differs between the two modes.
	XMLFormat bool
}

// callAPI makes a streaming request to the OpenAI-compatible endpoint and
// assembles the full response from SSE chunks. Using streaming avoids the
// long wait for non-streaming responses (the API starts emitting data within
// seconds instead of blocking until the full completion is ready).
func (b *claudeggBackend) callAPI(
	ctx context.Context,
	messages []map[string]any,
	model, apiKey, baseURL string,
) (*claudeGGAPIResponse, *TokenUsage, error) {
	reqBody, err := json.Marshal(map[string]any{
		"model":      model,
		"messages":   messages,
		"tools":      []any{claudeGGBashTool},
		"stream":     true,
		"max_tokens": 8192, // cap generation length to reduce per-turn latency
	})
	if err != nil {
		return nil, nil, fmt.Errorf("claude-gg: marshal request: %w", err)
	}

	// Retry up to 2 times on transient errors with exponential backoff.
	const maxRetries = 2
	retryDelays := []time.Duration{2 * time.Second, 5 * time.Second}

	// httpClient uses ResponseHeaderTimeout so we fail fast when the server
	// doesn't respond, but once headers arrive we read the stream freely
	// (bounded only by the caller's ctx which carries the overall task timeout).
	httpClient := &http.Client{
		Transport: &http.Transport{
			ResponseHeaderTimeout: 15 * time.Second,
		},
	}

	for attempt := 0; attempt <= maxRetries; attempt++ {
		req, err := http.NewRequestWithContext(ctx, http.MethodPost,
			baseURL+"/v1/chat/completions", bytes.NewReader(reqBody))
		if err != nil {
			return nil, nil, fmt.Errorf("claude-gg: create request: %w", err)
		}
		req.Header.Set("Authorization", "Bearer "+apiKey)
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Accept", "text/event-stream")

		resp, doErr := httpClient.Do(req)
		if doErr != nil {
			if attempt < maxRetries && ctx.Err() == nil {
				b.cfg.Logger.Warn("claude-gg: request error, retrying",
					"attempt", attempt+1, "error", doErr)
				select {
				case <-ctx.Done():
					return nil, nil, ctx.Err()
				case <-time.After(retryDelays[attempt]):
				}
				continue
			}
			return nil, nil, fmt.Errorf("claude-gg: HTTP request: %w", doErr)
		}

		// Retry on transient HTTP errors.
		if resp.StatusCode == 524 || resp.StatusCode == 502 || resp.StatusCode == 503 {
			body, _ := io.ReadAll(io.LimitReader(resp.Body, 256))
			resp.Body.Close()
			if attempt < maxRetries && ctx.Err() == nil {
				b.cfg.Logger.Warn("claude-gg: transient error, retrying",
					"attempt", attempt+1, "status", resp.StatusCode, "body", strings.TrimSpace(string(body)))
				select {
				case <-ctx.Done():
					return nil, nil, ctx.Err()
				case <-time.After(retryDelays[attempt]):
				}
				continue
			}
			return nil, nil, fmt.Errorf("claude-gg: HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
		}

		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
			resp.Body.Close()
			return nil, nil, fmt.Errorf("claude-gg: HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
		}

		// Parse the SSE stream.
		result, usage, parseErr := b.parseStream(resp.Body)
		resp.Body.Close()
		if parseErr != nil {
			if attempt < maxRetries && ctx.Err() == nil {
				b.cfg.Logger.Warn("claude-gg: stream parse error, retrying",
					"attempt", attempt+1, "error", parseErr)
				select {
				case <-ctx.Done():
					return nil, nil, ctx.Err()
				case <-time.After(retryDelays[attempt]):
				}
				continue
			}
			return nil, nil, parseErr
		}

		// Fallback: if the model embedded tool calls as XML in the content field
		// (Claude's native format) instead of using the structured tool_calls field.
		if len(result.ToolCalls) == 0 && strings.Contains(result.Content, "<tool_call>") {
			prefix, xmlCalls := extractXMLToolCalls(result.Content)
			if len(xmlCalls) > 0 {
				result.Content = prefix
				result.ToolCalls = xmlCalls
				result.XMLFormat = true
			}
		}

		return result, usage, nil
	}
	// Unreachable, but satisfies the compiler.
	return nil, nil, fmt.Errorf("claude-gg: exhausted retries")
}

// tcAccum accumulates streaming tool call fragments by index.
type tcAccum struct {
	id        string
	name      string
	arguments strings.Builder
}

// parseStream reads an SSE body and assembles a complete claudeGGAPIResponse.
func (b *claudeggBackend) parseStream(body io.Reader) (*claudeGGAPIResponse, *TokenUsage, error) {
	var (
		content  strings.Builder
		tcMap    = map[int]*tcAccum{}
		usage    *TokenUsage
	)

	scanner := bufio.NewScanner(body)
	// Increase buffer for large tool-call argument chunks.
	scanner.Buffer(make([]byte, 64*1024), 64*1024)

	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		data := strings.TrimPrefix(line, "data: ")
		if data == "[DONE]" {
			break
		}

		var chunk claudeGGStreamChunk
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			// Skip malformed chunks; non-JSON lines are common in SSE.
			continue
		}

		if chunk.Usage != nil {
			usage = &TokenUsage{
				InputTokens:  chunk.Usage.PromptTokens,
				OutputTokens: chunk.Usage.CompletionTokens,
			}
		}

		if len(chunk.Choices) == 0 {
			continue
		}
		delta := chunk.Choices[0].Delta

		if delta.Content != "" {
			content.WriteString(delta.Content)
		}

		for _, tc := range delta.ToolCalls {
			acc := tcMap[tc.Index]
			if acc == nil {
				acc = &tcAccum{}
				tcMap[tc.Index] = acc
			}
			if tc.ID != "" {
				acc.id = tc.ID
			}
			if tc.Function.Name != "" {
				acc.name = tc.Function.Name
			}
			acc.arguments.WriteString(tc.Function.Arguments)
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, nil, fmt.Errorf("claude-gg: stream read error: %w", err)
	}

	// Convert accumulated tool calls (sorted by index) to the standard type.
	indices := make([]int, 0, len(tcMap))
	for idx := range tcMap {
		indices = append(indices, idx)
	}
	sort.Ints(indices)

	toolCalls := make([]claudeGGToolCall, 0, len(indices))
	for i, idx := range indices {
		acc := tcMap[idx]
		id := acc.id
		if id == "" {
			id = fmt.Sprintf("stream-call-%d", i)
		}
		toolCalls = append(toolCalls, claudeGGToolCall{
			ID:   id,
			Type: "function",
			Function: claudeGGToolCallFunc{
				Name:      acc.name,
				Arguments: acc.arguments.String(),
			},
		})
	}

	return &claudeGGAPIResponse{
		Content:   content.String(),
		ToolCalls: toolCalls,
	}, usage, nil
}

// historyLimit is the maximum number of bytes kept for a tool result that is
// fed back into the conversation history. The full output is still emitted to
// the live activity stream; this limit only affects what the model sees in
// subsequent turns. Keeping history lean reduces per-turn token counts and
// therefore per-turn API latency.
const historyLimit = 6 * 1024 // 6 KiB per tool result in history

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

// --- Streaming response types ---

type claudeGGStreamChunk struct {
	Choices []claudeGGStreamChoice `json:"choices"`
	Usage   *claudeGGUsage         `json:"usage,omitempty"`
}

type claudeGGStreamChoice struct {
	Delta        claudeGGStreamDelta `json:"delta"`
	FinishReason *string             `json:"finish_reason"`
}

type claudeGGStreamDelta struct {
	Role      string                   `json:"role,omitempty"`
	Content   string                   `json:"content,omitempty"`
	ToolCalls []claudeGGStreamToolCall `json:"tool_calls,omitempty"`
}

type claudeGGStreamToolCall struct {
	Index    int                        `json:"index"`
	ID       string                     `json:"id,omitempty"`
	Type     string                     `json:"type,omitempty"`
	Function claudeGGStreamToolCallFunc `json:"function"`
}

type claudeGGStreamToolCallFunc struct {
	Name      string `json:"name,omitempty"`
	Arguments string `json:"arguments,omitempty"`
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
