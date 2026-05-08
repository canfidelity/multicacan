package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"

	"github.com/canfidelity/multicacan/server/internal/cli"
)

var assetsCmd = &cobra.Command{
	Use:   "assets",
	Short: "Manage workspace assets (images, templates, media)",
}

var assetsListCmd = &cobra.Command{
	Use:   "list",
	Short: "List workspace assets",
	Example: `  multicacan assets list
  multicacan assets list --tag template
  multicacan assets list --tag "background,title" --output json`,
	RunE: runAssetsList,
}

var assetsGetCmd = &cobra.Command{
	Use:   "get <id>",
	Short: "Get a single asset by ID",
	Args:  exactArgs(1),
	RunE:  runAssetsGet,
}

var assetsUploadCmd = &cobra.Command{
	Use:   "upload <file>",
	Short: "Upload a file to the workspace asset pool",
	Example: `  multicacan assets upload logo.png --name "Company Logo" --tag "brand,logo"
  multicacan assets upload background.jpg --tag "background" --description "Dark gradient"`,
	Args: exactArgs(1),
	RunE: runAssetsUpload,
}

var assetsDeleteCmd = &cobra.Command{
	Use:   "delete <id>",
	Short: "Delete an asset by ID",
	Args:  exactArgs(1),
	RunE:  runAssetsDelete,
}

func init() {
	assetsListCmd.Flags().String("tag", "", "Filter by tag (comma-separated for multiple)")
	assetsListCmd.Flags().String("output", "", "Output format: json")

	assetsGetCmd.Flags().String("output", "", "Output format: json")

	assetsUploadCmd.Flags().String("name", "", "Asset name (defaults to filename)")
	assetsUploadCmd.Flags().String("description", "", "Asset description")
	assetsUploadCmd.Flags().String("tag", "", "Comma-separated tags (e.g. template,background)")

	assetsCmd.AddCommand(assetsListCmd)
	assetsCmd.AddCommand(assetsGetCmd)
	assetsCmd.AddCommand(assetsUploadCmd)
	assetsCmd.AddCommand(assetsDeleteCmd)
}

func runAssetsList(cmd *cobra.Command, _ []string) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}

	tag, _ := cmd.Flags().GetString("tag")
	endpoint := "/api/assets"
	if tag != "" {
		endpoint += "?tag=" + tag
	}

	var assets []map[string]any
	if err := client.GetJSON(cmd.Context(), endpoint, &assets); err != nil {
		return fmt.Errorf("list assets: %w", err)
	}

	output, _ := cmd.Flags().GetString("output")
	if output == "json" {
		return cli.PrintJSON(os.Stdout, assets)
	}

	if len(assets) == 0 {
		fmt.Fprintln(os.Stdout, "No assets found.")
		return nil
	}

	for _, a := range assets {
		id := strVal(a, "id")
		name := strVal(a, "name")
		contentType := strVal(a, "content_type")
		tags := assetTagsDisplay(a)
		fmt.Fprintf(os.Stdout, "%s  %-40s  %-24s  %s\n", id, name, contentType, tags)
	}
	return nil
}

func runAssetsGet(cmd *cobra.Command, args []string) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}

	var asset map[string]any
	if err := client.GetJSON(cmd.Context(), "/api/assets/"+args[0], &asset); err != nil {
		return fmt.Errorf("get asset: %w", err)
	}

	output, _ := cmd.Flags().GetString("output")
	if output == "json" {
		return cli.PrintJSON(os.Stdout, asset)
	}

	fmt.Fprintf(os.Stdout, "ID:           %s\n", strVal(asset, "id"))
	fmt.Fprintf(os.Stdout, "Name:         %s\n", strVal(asset, "name"))
	fmt.Fprintf(os.Stdout, "Description:  %s\n", strVal(asset, "description"))
	fmt.Fprintf(os.Stdout, "Tags:         %s\n", assetTagsDisplay(asset))
	fmt.Fprintf(os.Stdout, "Content-Type: %s\n", strVal(asset, "content_type"))
	fmt.Fprintf(os.Stdout, "URL:          %s\n", strVal(asset, "download_url"))
	return nil
}

func runAssetsUpload(cmd *cobra.Command, args []string) error {
	filePath := args[0]
	fileData, err := os.ReadFile(filePath)
	if err != nil {
		return fmt.Errorf("read file: %w", err)
	}

	name, _ := cmd.Flags().GetString("name")
	description, _ := cmd.Flags().GetString("description")
	tag, _ := cmd.Flags().GetString("tag")

	if name == "" {
		name = filepath.Base(filePath)
	}

	var body bytes.Buffer
	mw := multipart.NewWriter(&body)

	fw, err := mw.CreateFormFile("file", filepath.Base(filePath))
	if err != nil {
		return err
	}
	if _, err := fw.Write(fileData); err != nil {
		return err
	}
	_ = mw.WriteField("name", name)
	if description != "" {
		_ = mw.WriteField("description", description)
	}
	if tag != "" {
		_ = mw.WriteField("tags", tag)
	}
	mw.Close()

	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}

	// Build multipart POST manually using the underlying HTTP client.
	apiBase := client.BaseURL
	req, err := http.NewRequestWithContext(cmd.Context(), http.MethodPost, apiBase+"/api/assets", &body)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", mw.FormDataContentType())
	client.SetHeaders(req)

	resp, err := client.HTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("upload request: %w", err)
	}
	defer resp.Body.Close()

	respData, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if resp.StatusCode >= 400 {
		return fmt.Errorf("upload failed (%d): %s", resp.StatusCode, strings.TrimSpace(string(respData)))
	}

	var asset map[string]any
	if err := json.Unmarshal(respData, &asset); err != nil {
		return fmt.Errorf("decode response: %w", err)
	}

	fmt.Fprintf(os.Stdout, "Uploaded: %s (%s)\n", strVal(asset, "id"), strVal(asset, "name"))
	return cli.PrintJSON(os.Stdout, asset)
}

func runAssetsDelete(cmd *cobra.Command, args []string) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}

	if err := client.DeleteJSON(cmd.Context(), "/api/assets/"+args[0]); err != nil {
		return fmt.Errorf("delete asset: %w", err)
	}

	fmt.Fprintf(os.Stdout, "Deleted asset %s\n", args[0])
	return nil
}

func assetTagsDisplay(a map[string]any) string {
	raw, ok := a["tags"]
	if !ok {
		return ""
	}
	switch v := raw.(type) {
	case []string:
		return strings.Join(v, ", ")
	case []any:
		parts := make([]string, 0, len(v))
		for _, t := range v {
			if s, ok := t.(string); ok {
				parts = append(parts, s)
			}
		}
		return strings.Join(parts, ", ")
	}
	return ""
}
