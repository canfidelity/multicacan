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

// extractXMLToolCalls parses XML tool-call blocks that Claude models sometimes
// embed directly in the content field instead of using the structured OpenAI
// tool_calls field. It handles two tag variants:
//   - <tool_call>...</tool_call>  (Claude's native format)
//   - <tool_use>...</tool_use>    (alternate format used by some model versions)
//
// Returns the text before the first tool call (the "prefix") and all parsed
// tool calls. Hallucinated response blocks (<tool_response>, <tool_result>)
// that the model generates between calls are silently dropped — we replace
// them with real execution results.
func extractXMLToolCalls(content string) (prefix string, calls []claudeGGToolCall) {
	// Try both tag variants; use whichever appears first.
	type tagPair struct{ start, end string }
	variants := []tagPair{
		{"<tool_call>", "</tool_call>"},
		{"<tool_use>", "</tool_use>"},
	}

	chosen := tagPair{}
	firstIdx := -1
	for _, v := range variants {
		idx := strings.Index(content, v.start)
		if idx != -1 && (firstIdx == -1 || idx < firstIdx) {
			firstIdx = idx
			chosen = v
		}
	}
	if firstIdx == -1 {
		return content, nil
	}

	prefix = strings.TrimSpace(content[:firstIdx])

	s := content[firstIdx:]
	id := 0
	for {
		start := strings.Index(s, chosen.start)
		if start == -1 {
			break
		}
		end := strings.Index(s, chosen.end)
		if end == -1 || end < start {
			break
		}
		body := strings.TrimSpace(s[start+len(chosen.start) : end])
		s = s[end+len(chosen.end):]

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

// claudeGGBashTool is the bash executor tool exposed to the model.
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

// claudeGGTaskCompleteTool signals that the agent has finished the task.
// Using tool_choice:"required" forces the model to always call a tool, so
// the only way to end the loop is to explicitly call task_complete — this
// eliminates premature completion caused by text-only planning turns.
var claudeGGTaskCompleteTool = map[string]any{
	"type": "function",
	"function": map[string]any{
		"name":        "task_complete",
		"description": "Signal that you have fully completed the task. Call this ONLY when all requested work is done and the result comment has been posted via `multica issue comment add`. Do NOT call this while still planning or mid-execution.",
		"parameters": map[string]any{
			"type": "object",
			"properties": map[string]any{
				"result": map[string]any{
					"type":        "string",
					"description": "A brief summary of what was accomplished.",
				},
			},
			"required": []string{"result"},
		},
	},
}

// claudeGGTools is the full tool list sent on every request.
var claudeGGTools = []any{claudeGGBashTool, claudeGGTaskCompleteTool}

// historyLimit is the maximum number of bytes kept per tool result in history.
const historyLimit = 8 * 1024 // 8 KiB

// maxHistoryMessages caps the conversation history to prevent context bloat
// and hallucination from overly long histories.
const maxHistoryMessages = 30

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

		// Tool-execution loop: the model must call either bash (to do work) or
		// task_complete (to signal it's done). tool_choice:"required" prevents
		// text-only planning turns that previously caused premature completion.
		for turn := 0; turn < maxTurns; turn++ {
			// Trim history to avoid context bloat and hallucination.
			if len(messages) > maxHistoryMessages {
				// Always keep the system message (index 0) and trim the middle.
				messages = append(messages[:1], messages[len(messages)-maxHistoryMessages+1:]...)
			}

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

			// Max turns reached — force stop.
			if turn == maxTurns-1 {
				finalOutput = lastTextContent
				break
			}

			// No tool calls on this turn. With tool_choice:"required" this should
			// not normally happen, but handle it gracefully: treat as a planning
			// turn and continue (do NOT break — that's the old premature-exit bug).
			if len(apiResp.ToolCalls) == 0 {
				b.cfg.Logger.Warn("claude-gg: text-only turn (tool_choice ignored?), continuing", "turn", turn+1)
				messages = append(messages, map[string]any{
					"role":    "assistant",
					"content": apiResp.Content,
				})
				messages = append(messages, map[string]any{
					"role":    "user",
					"content": "Continue. Use bash to perform the next step, or call task_complete if you are fully done.",
				})
				continue
			}

			// Check whether the model called task_complete.
			taskDone := false
			for _, tc := range apiResp.ToolCalls {
				if tc.Function.Name == "task_complete" {
					var args struct {
						Result string `json:"result"`
					}
					_ = json.Unmarshal([]byte(tc.Function.Arguments), &args)
					if args.Result != "" {
						finalOutput = args.Result
					} else {
						finalOutput = lastTextContent
					}
					taskDone = true
					break
				}
			}
			if taskDone {
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
						toolOutput = fmt.Sprintf("unknown tool %q", tc.Function.Name)
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
						toolOutput = fmt.Sprintf("unknown tool %q", tc.Function.Name)
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

// claudeGGAPIResponse holds the parsed result of a single non-streaming API call.
type claudeGGAPIResponse struct {
	Content   string
	ToolCalls []claudeGGToolCall
	// XMLFormat is true when tool calls were extracted from inline XML tags in
	// the content field rather than from the structured tool_calls field. The
	// conversation history format differs between the two modes.
	XMLFormat bool
}

// callAPI makes a single non-streaming request to the OpenAI-compatible endpoint.
func (b *claudeggBackend) callAPI(
	ctx context.Context,
	messages []map[string]any,
	model, apiKey, baseURL string,
) (*claudeGGAPIResponse, *TokenUsage, error) {
	reqBody, err := json.Marshal(map[string]any{
		"model":       model,
		"messages":    messages,
		"tools":       claudeGGTools,
		"tool_choice": "required",
		"stream":      false,
	})
	if err != nil {
		return nil, nil, fmt.Errorf("claude-gg: marshal request: %w", err)
	}

	// Retry up to 3 times on transient server errors (524 Cloudflare timeout,
	// 502 Bad Gateway, 503 Service Unavailable) with exponential backoff.
	const maxRetries = 3
	retryDelays := []time.Duration{2 * time.Second, 5 * time.Second, 10 * time.Second}

	var (
		resp    *http.Response
		doErr   error
		attempt int
	)
	for attempt = 0; attempt <= maxRetries; attempt++ {
		req, err := http.NewRequestWithContext(ctx, http.MethodPost,
			baseURL+"/v1/chat/completions", bytes.NewReader(reqBody))
		if err != nil {
			return nil, nil, fmt.Errorf("claude-gg: create request: %w", err)
		}
		req.Header.Set("Authorization", "Bearer "+apiKey)
		req.Header.Set("Content-Type", "application/json")

		// Use a per-request timeout so hung connections don't block indefinitely.
		httpClient := &http.Client{Timeout: 90 * time.Second}
		resp, doErr = httpClient.Do(req)
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
		break // success or non-retryable error
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

	// Fallback: if the model embedded tool calls as XML in the content field
	// (Claude's native format, or the <tool_use> variant) instead of using the
	// structured tool_calls field, extract them so the execution loop can run
	// them normally.
	if len(result.ToolCalls) == 0 &&
		(strings.Contains(msg.Content, "<tool_call>") || strings.Contains(msg.Content, "<tool_use>")) {
		prefix, xmlCalls := extractXMLToolCalls(msg.Content)
		if len(xmlCalls) > 0 {
			result.Content = prefix
			result.ToolCalls = xmlCalls
			result.XMLFormat = true
		}
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
