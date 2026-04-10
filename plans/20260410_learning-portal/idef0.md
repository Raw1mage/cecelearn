# IDEF0 - Learning Portal

## A-0 Context
- Function: Deliver a unified learning portal web product
- Inputs: legacy A1/A2/A3 codebases, product requirements, Docker deployment target
- Controls: unified webapp rule, BUILD-based Docker assembly, port 7014, security boundary for provider keys
- Outputs: portal shell, three child features, backend API boundaries, deployable Docker package inputs
- Mechanisms: `webapp/frontend`, `webapp/backend`, `BUILD/`, gateway, provider adapters

## A0 Decomposition
- A1 Build portal shell and route registry
- A2 Migrate A1 word lookup as child feature
- A3 Migrate A2 idiom quiz as child feature
- A4 Migrate A3 math learning as child feature
- A5 Assemble Docker runtime and deployment package

## Child details
### A1 Build portal shell and route registry
- input: route list, card metadata, shared layout requirements
- output: homepage, feature cards, route map

### A2 Migrate A1 word lookup
- input: speech flow, lookup flow, HanziWriter integration
- output: `/a1` feature module and backend lookup boundary

### A3 Migrate A2 idiom quiz
- input: idiom bank, quiz state flow, provider generation contract
- output: `/a2` feature module and backend quiz endpoint

### A4 Migrate A3 math learning
- input: arithmetic engines, animation controls, keypad flow
- output: `/a3` feature module

### A5 Assemble Docker runtime and deployment package
- input: frontend/backend source, gateway config, env/runtime rules
- output: container build assets under `BUILD/`, externally reachable service on `7014`
