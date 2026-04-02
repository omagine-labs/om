#!/usr/bin/env node

/**
 * Custom Claude PR Review Script for Om Desktop
 *
 * This script provides structured PR reviews using Claude with clear completion criteria.
 * It ensures reviews are comprehensive before posting results.
 *
 * For large PRs (>2000 lines), it uses file-by-file analysis instead of full diffs
 * to stay within token limits while still providing thorough reviews.
 */

const Anthropic = require('@anthropic-ai/sdk');
const { execSync } = require('child_process');
const fs = require('fs');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const PR_NUMBER = process.env.PR_NUMBER;
const REPO = process.env.GITHUB_REPOSITORY;

// Max lines of diff to include before switching to file-summary mode
const MAX_DIFF_LINES = 2000;

if (!ANTHROPIC_API_KEY || !GITHUB_TOKEN || !PR_NUMBER) {
  console.error('Missing required environment variables');
  console.error('ANTHROPIC_API_KEY:', !!ANTHROPIC_API_KEY);
  console.error('GITHUB_TOKEN:', !!GITHUB_TOKEN);
  console.error('PR_NUMBER:', PR_NUMBER);
  process.exit(1);
}

const anthropic = new Anthropic({
  apiKey: ANTHROPIC_API_KEY,
});

function execCommand(command) {
  try {
    return execSync(command, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (error) {
    console.error(`Command failed: ${command}`);
    console.error('Error:', error.message);
    if (error.stderr) console.error('Stderr:', error.stderr.toString());
    throw error;
  }
}

// Get PR information
function getPRInfo() {
  console.log('Fetching PR information...');

  const prData = JSON.parse(
    execCommand(
      `gh pr view ${PR_NUMBER} --json title,body,files,additions,deletions`
    )
  );

  const totalChanges = prData.additions + prData.deletions;
  console.log(
    `PR has ${prData.additions} additions, ${prData.deletions} deletions (${totalChanges} total changes)`
  );

  return {
    title: prData.title,
    body: prData.body || 'No description provided',
    files: prData.files,
    totalChanges,
    isLarge: totalChanges > MAX_DIFF_LINES,
  };
}

// Get diff with smart truncation for large PRs
function getDiffContent(isLarge, files) {
  if (isLarge) {
    console.log(
      'Large PR detected - using file summaries instead of full diff'
    );

    // Generate file stats from the files array we already have
    const stats = files
      .map((f) => {
        const additions = f.additions || 0;
        const deletions = f.deletions || 0;
        return `${f.path.padEnd(60)} +${additions} -${deletions}`;
      })
      .join('\n');

    return `**File Changes Summary** (Full diff omitted due to size - ${MAX_DIFF_LINES}+ lines)\n\n\`\`\`\n${stats}\n\`\`\``;
  } else {
    console.log('Fetching full diff...');
    return execCommand(`gh pr diff ${PR_NUMBER}`);
  }
}

// Get key changed files for large PRs
function getKeyChangedFiles(files, isLarge) {
  if (!isLarge) return null;

  console.log('Getting key changed file contents for large PR...');

  // Focus on key file types that need careful review for Electron app
  const criticalPatterns = [
    /main\.ts$/, // Main process
    /preload\.ts$/, // Preload script (security boundary)
    /auth/, // Auth-related files
    /lib\/.*\.ts$/, // Core library files
    /\.github\/workflows\//, // CI/CD changes
  ];

  const criticalFiles = files.filter((file) =>
    criticalPatterns.some((pattern) => pattern.test(file.path))
  );

  if (criticalFiles.length === 0) {
    return '**No critical files detected** (main process, preload, auth)';
  }

  const fileContents = criticalFiles
    .slice(0, 5)
    .map((file) => {
      try {
        const content = execCommand(
          `gh pr diff ${PR_NUMBER} -- "${file.path}"`
        );
        return `### ${file.path}\n\`\`\`diff\n${content}\n\`\`\``;
      } catch (error) {
        return `### ${file.path}\n*Could not fetch diff*`;
      }
    })
    .join('\n\n');

  return `**Critical Files for Review** (showing up to 5):\n\n${fileContents}`;
}

// Read CLAUDE.md context file
function getProjectContext(files) {
  const contexts = [];
  const includedFiles = [];

  // Check for project context file
  if (fs.existsSync('.claude/CLAUDE.md')) {
    const content = fs.readFileSync('.claude/CLAUDE.md', 'utf-8');
    contexts.push('# Project Context\n' + content);
    includedFiles.push('.claude/CLAUDE.md');
  }

  console.log(
    `📚 Including context from: ${includedFiles.join(', ') || 'none found'}`
  );

  return contexts.join('\n\n');
}

const SYSTEM_PROMPT = `You are a code reviewer for an Electron desktop application pull request. You must provide a comprehensive review covering ALL of the following categories:

## Required Review Categories (ALL MUST BE ADDRESSED):

1. **Code Quality**
   - Adherence to project conventions (ESLint, TypeScript)
   - Code clarity and maintainability
   - Proper error handling

2. **Security**
   - Electron security best practices (contextIsolation, nodeIntegration)
   - No exposed API keys or secrets
   - Proper IPC security (preload script validation)
   - Deep link handler security (URL validation, token handling)

3. **Electron Architecture**
   - Proper main/renderer process separation
   - Safe IPC communication
   - Secure preload script usage
   - No security anti-patterns

4. **Authentication & Sessions**
   - Secure token storage (encrypted session store)
   - Proper OAuth/deep link flows
   - Session management best practices

5. **Testing**
   - Test coverage for new functionality
   - Edge cases considered

6. **Performance**
   - No obvious performance issues
   - Efficient native API usage

## Response Format:

You MUST structure your response EXACTLY as follows:

### Code Quality
[Your analysis]

### Security
[Your analysis]

### Electron Architecture
[Your analysis]

### Authentication & Sessions
[Your analysis or "N/A - No auth changes"]

### Testing
[Your analysis]

### Performance
[Your analysis]

### Summary
[Overall assessment: APPROVE, REQUEST CHANGES, or COMMENT]

### Action Items
- [ ] Item 1
- [ ] Item 2

DO NOT respond until you have analyzed ALL categories above. If a category is not applicable, explicitly state "N/A" with brief reasoning.

IMPORTANT: For large PRs where full diffs are not provided, focus your review on:
- File changes summary and patterns
- Critical files (main process, preload, auth, security)
- Architectural concerns
- General code quality based on file types and structure`;

async function getReview(prInfo, diffContent, keyFiles, projectContext) {
  const userPrompt = `Review this pull request:

## Project Context & Review Guidelines
${projectContext}

## PR Information
**Title:** ${prInfo.title}
**Description:**
${prInfo.body}

**Changes:** ${prInfo.totalChanges} lines (${prInfo.files.length} files)

## Changed Files
${prInfo.files.map((f) => `- ${f.path} (+${f.additions || 0} -${f.deletions || 0})`).join('\n')}

${keyFiles ? keyFiles : `## Diff\n\`\`\`diff\n${diffContent}\n\`\`\``}

Provide a comprehensive review covering ALL required categories.`;

  console.log('Sending request to Claude...');
  console.log(`Prompt length: ${userPrompt.length} chars`);

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: userPrompt,
      },
    ],
  });

  return message.content[0].text;
}

async function postComment(body) {
  const escapedBody = body
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$');

  execCommand(`gh pr comment ${PR_NUMBER} --body "${escapedBody}"`);
}

async function main() {
  console.log(`🔍 Reviewing PR #${PR_NUMBER}...`);

  // Gather PR information
  const prInfo = getPRInfo();
  const diffContent = getDiffContent(prInfo.isLarge, prInfo.files);
  const keyFiles = getKeyChangedFiles(prInfo.files, prInfo.isLarge);
  const projectContext = getProjectContext(prInfo.files);

  // Get Claude's review
  const review = await getReview(prInfo, diffContent, keyFiles, projectContext);

  // Validate that review contains all required sections
  const requiredSections = [
    'Code Quality',
    'Security',
    'Electron Architecture',
    'Authentication & Sessions',
    'Testing',
    'Performance',
    'Summary',
  ];

  const missingSections = requiredSections.filter(
    (section) =>
      !review.includes(`## ${section}`) && !review.includes(`### ${section}`)
  );

  if (missingSections.length > 0) {
    console.error('⚠️  Review incomplete. Missing sections:', missingSections);
    console.error('\nReview output:');
    console.error(review);

    // Post what we got anyway, but flag it as incomplete
    const incompleteComment = `## ⚠️ Incomplete Claude Code Review

**Warning:** This review is missing required sections: ${missingSections.join(', ')}

${review}

---
*This review may be incomplete. Please re-trigger with \`@claude\` if needed.*`;

    await postComment(incompleteComment);
    process.exit(1);
  }

  const comment = `## 🤖 Claude Code Review

${review}

---
*Review generated by Claude Haiku 4.5 | ${prInfo.isLarge ? 'Large PR - reviewed file summaries' : 'Full diff reviewed'}*`;

  await postComment(comment);
  console.log('✅ Review posted successfully');
}

main().catch((error) => {
  console.error('❌ Error:', error.message);
  console.error(error.stack);
  process.exit(1);
});
