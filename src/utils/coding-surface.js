'use strict';

/**
 * Public tool boundary for Skuld's coding window.
 *
 * Tools inherited from the old general-purpose assistant are deliberately not
 * present here. A hidden tool is still an executable tool, so this list is
 * enforced while loading modules, not merely while rendering their schemas.
 */
const CODING_TOOL_NAMES = new Set([
  // Workspace files and patches
  'read_file', 'write_file', 'edit_file', 'structural_patch', 'notebook_edit',
  'list_dir', 'file_search', 'grep_search', 'filesystem', 'file_state', 'checkpoint',

  // Commands, tests and source control
  'bash', 'shell_command', 'code_execution', 'git',
  'skuld_system',

  // Planning and delegated coding work
  'plan', 'todo_write', 'clarify', 'blueprint', 'workflow',
  'sub_agent', 'delegate_task', 'async_delegation', 'llm_task',

  // Project knowledge and durable context
  'memory', 'memory_search', 'memory_write', 'memory_tree',
  'cross_session_memory', 'session_search',
  'skill_find', 'skill_view', 'skills_list', 'skills_autoload',

  // Technical research and web-app verification
  'web_search', 'web_readability', 'duckduckgo_search', 'exa_search',
  'searxng_search', 'parallel_search', 'firecrawl', 'http_request', 'url_safety',
  'browser', 'browser_use', 'computer_use', 'computer_use_loop', 'macos_screenshot',

  // Coding assets and input inspection
  'document_extract', 'image_generation', 'media_understanding', 'pii_redact',

  // Explicit approval is part of the coding security model.
  'approval',
]);

// A few source filenames export a differently named public tool.
const CODING_TOOL_SOURCES = new Set([
  ...CODING_TOOL_NAMES,
  'duckduckgo',
  'searxng',
]);

function isCodingToolName(name) {
  return CODING_TOOL_NAMES.has(String(name || ''));
}

function isCodingToolSource(filename) {
  const base = String(filename || '').replace(/\.js$/i, '');
  return CODING_TOOL_SOURCES.has(base);
}

module.exports = { CODING_TOOL_NAMES, CODING_TOOL_SOURCES, isCodingToolName, isCodingToolSource };
