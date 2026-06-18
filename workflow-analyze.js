export const meta = {
  name: 'governance-analyze',
  description: 'Analyze a project codebase and produce a structured project profile for governance document generation',
  phases: [
    { title: 'Analyze', detail: 'Four parallel agents: code structure, dependencies, config, security' },
    { title: 'Summarize', detail: 'Merge results into project profile' },
  ],
}

// --- Agent output schemas ---

const CODE_STRUCTURE_SCHEMA = {
  type: 'object',
  properties: {
    language: { type: 'string', description: 'Primary programming language (e.g., Go, Python, TypeScript, Rust)' },
    framework: { type: 'string', description: 'Primary framework (e.g., Gin, Django, Next.js, Actix)' },
    build_system: { type: 'string', description: 'Build system (e.g., go modules, pip, npm, cargo)' },
    entry_points: {
      type: 'array',
      items: { type: 'string' },
      description: 'Entry point files (main.go, index.ts, app.py, etc.)',
    },
    dir_layout: {
      type: 'object',
      description: 'Top-level directory structure with one-line purpose descriptions',
    },
    arch_pattern: { type: 'string', description: 'Inferred architecture pattern (layered, hexagonal, event-driven, microservices, monolith, etc.)' },
    code_conventions: {
      type: 'array',
      items: { type: 'string' },
      description: 'Observed code conventions (naming, file organization, error handling style)',
    },
    confidence: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'] },
  },
  required: ['language', 'framework', 'build_system', 'entry_points', 'arch_pattern', 'confidence'],
}

const DEPENDENCY_SCHEMA = {
  type: 'object',
  properties: {
    deps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          version: { type: 'string' },
          category: { type: 'string', description: 'db_driver, mq, cache, http, auth, logging, testing, other' },
        },
        required: ['name', 'category'],
      },
    },
    categorized: {
      type: 'object',
      properties: {
        db_driver: { type: 'array', items: { type: 'string' } },
        mq: { type: 'array', items: { type: 'string' } },
        cache: { type: 'array', items: { type: 'string' } },
        http: { type: 'array', items: { type: 'string' } },
        auth: { type: 'array', items: { type: 'string' } },
      },
    },
    version_constraints: { type: 'array', items: { type: 'string' }, description: 'Known version constraints or compatibility notes' },
    external_services_inferred: { type: 'array', items: { type: 'string' }, description: 'Inferred external services (PostgreSQL, Redis, Kafka, etc.)' },
  },
  required: ['deps', 'categorized'],
}

const CONFIG_SCHEMA = {
  type: 'object',
  properties: {
    scripts: {
      type: 'object',
      description: 'Key scripts: build, test, run, lint, migrate, deploy etc.',
    },
    ci_pipeline: { type: 'string', description: 'CI/CD pipeline description (provider, key stages)' },
    deployment: {
      type: 'object',
      properties: {
        has_dockerfile: { type: 'boolean' },
        has_k8s: { type: 'boolean' },
        has_terraform: { type: 'boolean' },
        has_docker_compose: { type: 'boolean' },
        description: { type: 'string' },
      },
    },
    config_patterns: { type: 'array', items: { type: 'string' }, description: 'Config file patterns (env, yaml, toml, json)' },
    quality_tools: { type: 'array', items: { type: 'string' }, description: 'Lint, format, static analysis tools' },
  },
  required: ['scripts'],
}

const SECURITY_SCHEMA = {
  type: 'object',
  properties: {
    auth_mechanism: { type: 'string', description: 'Auth mechanism (JWT, OAuth2, session, API key, none detected)' },
    sensitive_data_handling: { type: 'string', description: 'How sensitive data is handled (encryption at rest, vault, env vars, plaintext risk)' },
    permission_model: { type: 'string', description: 'Permission/authorization model (RBAC, ACL, middleware, none detected)' },
    input_validation: { type: 'string', description: 'Input validation approach (validator lib, middleware, manual, none detected)' },
    security_policies: { type: 'array', items: { type: 'string' }, description: 'Existing security policy/config files found' },
  },
  required: ['auth_mechanism'],
}

// --- Agent prompts ---

const CODE_STRUCTURE_PROMPT = `Analyze the codebase at "${args.targetPath}". Your task:
1. Identify the primary programming language, framework, and build system by examining entry files (main.*, go.mod, package.json, Cargo.toml, etc.).
2. Map the top-level directory layout and describe each directory's purpose in one line.
3. Infer the architecture pattern from code organization.
4. Note code conventions (naming style, file naming patterns, error handling style).
5. Assign a confidence level to your findings.

Be thorough: list ALL directories at the top two levels. Be specific about framework name and version if detectable.`

const DEPENDENCY_PROMPT = `Analyze dependencies at "${args.targetPath}". Your task:
1. Parse the dependency manifest (go.mod, package.json, requirements.txt, Cargo.toml, etc.).
2. Categorize each key dependency: db_driver, mq, cache, http, auth, logging, testing, other.
3. Note any version constraints or compatibility notes.
4. Infer external services the project likely depends on.

Focus on production dependencies. Skip test-only deps unless they reveal important patterns (e.g., testcontainers → Docker dependency).`

const CONFIG_PROMPT = `Analyze build/run/CI/deploy configuration at "${args.targetPath}". Your task:
1. Extract key scripts: build, test, run, lint, migrate, deploy — from Makefile, package.json scripts, Taskfile, etc.
2. Describe the CI/CD pipeline if present (.github/workflows, .gitlab-ci.yml, Jenkinsfile, etc.).
3. Check deployment descriptors: Dockerfile, docker-compose.yml, k8s manifests, Terraform files.
4. List config file patterns in use.
5. List quality tools (linters, formatters, static analysis).

If a category is absent, say so explicitly — don't invent.`

const SECURITY_PROMPT = `Analyze security patterns at "${args.targetPath}". Your task:
1. Identify the auth mechanism (JWT middleware, OAuth2 flow, session-based, API key, basic auth, or none detected).
2. Describe how sensitive data appears to be handled (env vars for secrets, vault integration, encryption at rest, plaintext in config files — flag risks).
3. Identify the permission/authorization model.
4. Check for input validation approaches.
5. List any existing security policy files or security-related config.

Be conservative: if you can't find evidence, say "none detected" or "not observable from code."`

// --- Phase execution ---

phase('Analyze')

const [codeResult, depResult, configResult, securityResult] = await parallel([
  () => agent(CODE_STRUCTURE_PROMPT, { label: 'code-structure', schema: CODE_STRUCTURE_SCHEMA }),
  () => agent(DEPENDENCY_PROMPT, { label: 'dependencies', schema: DEPENDENCY_SCHEMA }),
  () => agent(CONFIG_PROMPT, { label: 'config', schema: CONFIG_SCHEMA }),
  () => agent(SECURITY_PROMPT, { label: 'security', schema: SECURITY_SCHEMA }),
])

phase('Summarize')

const SUMMARIZE_SCHEMA = {
  type: 'object',
  properties: {
    project_name: { type: 'string', description: 'Project name derived from directory name or package.json name field' },
    language: { type: 'string' },
    framework: { type: 'string' },
    domain: { type: 'string', description: 'Domain description in Chinese (e.g., 后端服务, Web应用, 数据处理, CLI工具)' },
    role: { type: 'string', description: 'Expert role description in Chinese (e.g., 精通 Go 的架构师, 精通 Python 的后端专家)' },
    priorities: {
      type: 'array',
      items: { type: 'string' },
      description: 'Priority chain in Chinese, ordered by importance',
    },
    dimensions: {
      type: 'array',
      items: { type: 'string', enum: ['code', 'database', 'maintenance', 'deploy'] },
      description: 'Applicable governance dimensions. code is always included.',
    },
    scope: { type: 'string', description: 'Scope description: key technologies and products covered' },
    deps_summary: {
      type: 'object',
      description: 'Key dependencies organized by category',
    },
    scripts_summary: {
      type: 'object',
      description: 'Key scripts: build, test, run, lint, etc.',
    },
    dirs_summary: {
      type: 'object',
      description: 'Key directories and their purposes',
    },
    security_summary: {
      type: 'object',
      description: 'Security findings summary',
    },
    confidence: {
      type: 'object',
      properties: {
        language: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] },
        framework: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] },
        arch_pattern: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] },
        dimensions: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] },
      },
    },
  },
  required: ['project_name', 'language', 'framework', 'domain', 'role', 'priorities', 'dimensions', 'scope'],
}

const SUMMARIZE_PROMPT = `Synthesize a project profile from these four analysis results. The profile will drive governance document generation.

Analysis results:
- Code Structure: ${JSON.stringify(codeResult)}
- Dependencies: ${JSON.stringify(depResult)}
- Config: ${JSON.stringify(configResult)}
- Security: ${JSON.stringify(securityResult)}

Instructions:
1. **project_name**: Use the directory name, or the name field from the package manifest.
2. **language / framework**: From code structure analysis.
3. **domain**: Describe the project's domain in Chinese. Be specific — "电商后端服务" is better than "后端服务".
4. **role**: Construct the expert role in Chinese. Pattern: "精通 {language} 的 {domain_specialist}". For Go backend → "精通 Go 的后端架构师". For Python data → "精通 Python 的数据工程师". Add DB expertise if dim-database applies.
5. **priorities**: Build an ordered priority list. Base: 数据安全 > 服务可用性 > 可恢复性 > 证据可信度 > ... Adapt to domain. For non-DB projects, start with 服务可用性.
6. **dimensions**: Determine which governance dimensions apply:
   - code: ALWAYS
   - database: if db_driver deps are present OR migration scripts found
   - deploy: if Dockerfile, k8s, Terraform, or CI deploy steps found
   - maintenance: if monitoring config or alert rules found
7. **scope**: List the key technologies (language, framework, key deps, deploy tech) as a comma-separated list.
8. **deps/scripts/dirs/security summaries**: Condense from the analysis results — what matters for governance.
9. **confidence**: Assess confidence in each key determination.`

const profile = await agent(SUMMARIZE_PROMPT, { label: 'summarize', schema: SUMMARIZE_SCHEMA })

return profile
