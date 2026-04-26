package agent

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
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

	messages := buildClaudeGGMessages(opts.SystemPrompt, prompt)

	reqBody, err := json.Marshal(map[string]any{
		"model":    model,
		"messages": messages,
		"stream":   true,
	})
	if err != nil {
		return nil, fmt.Errorf("claude-gg: marshal request: %w", err)
	}

	msgCh := make(chan Message, 256)
	resCh := make(chan Result, 1)

	go func() {
		defer close(msgCh)
		defer close(resCh)

		startTime := time.Now()

		runCtx, cancel := context.WithTimeout(ctx, timeout)
		defer cancel()

		req, err := http.NewRequestWithContext(runCtx, http.MethodPost,
			baseURL+"/v1/chat/completions", bytes.NewReader(reqBody))
		if err != nil {
			resCh <- Result{
				Status:     "failed",
				Error:      fmt.Sprintf("claude-gg: create request: %v", err),
				DurationMs: time.Since(startTime).Milliseconds(),
			}
			return
		}
		req.Header.Set("Authorization", "Bearer "+apiKey)
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Accept", "text/event-stream")

		b.cfg.Logger.Info("claude-gg request", "model", model, "base_url", baseURL)
		trySend(msgCh, Message{Type: MessageStatus, Status: "running"})

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			status := "failed"
			if runCtx.Err() == context.DeadlineExceeded {
				status = "timeout"
			} else if runCtx.Err() == context.Canceled {
				status = "aborted"
			}
			resCh <- Result{
				Status:     status,
				Error:      fmt.Sprintf("claude-gg: HTTP request: %v", err),
				DurationMs: time.Since(startTime).Milliseconds(),
			}
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
			resCh <- Result{
				Status:     "failed",
				Error:      fmt.Sprintf("claude-gg: HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(body))),
				DurationMs: time.Since(startTime).Milliseconds(),
			}
			return
		}

		var (
			output      strings.Builder
			usage       TokenUsage
			finalStatus = "completed"
			finalError  string
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

			// Accumulate usage from the final chunk (some providers send it there).
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
			if runCtx.Err() == context.DeadlineExceeded {
				finalStatus = "timeout"
				finalError = fmt.Sprintf("claude-gg timed out after %s", timeout)
			} else if runCtx.Err() == context.Canceled {
				finalStatus = "aborted"
				finalError = "execution cancelled"
			} else {
				finalStatus = "failed"
				finalError = fmt.Sprintf("claude-gg: read stream: %v", err)
			}
		}

		finalOutput := output.String()

		duration := time.Since(startTime)
		b.cfg.Logger.Info("claude-gg finished", "status", finalStatus, "duration", duration.Round(time.Millisecond))

		var usageMap map[string]TokenUsage
		if usage.InputTokens > 0 || usage.OutputTokens > 0 {
			usageMap = map[string]TokenUsage{model: usage}
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
