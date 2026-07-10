export type Runtime = "node" | "python" | "go" | "dotnet" | "generic";

export interface Command {
  name: string;
  run: string;
}

export interface HelmCheck {
  chart: string;
  values: string[];
}

export interface CiConfig {
  runtime: Runtime;
  version: string;
  packageManager?: "npm" | "pnpm" | "yarn";
  dependencyFile?: string;
  install?: string;
  commands: Command[];
  helm: HelmCheck[];
}

export interface Component {
  name: string;
  image: string;
  context: string;
  dockerfile: string;
  target: string;
  platforms: string;
}

export interface YamlUpdate {
  file: string;
  expression: string;
}

export interface EnvironmentConfig {
  enabled: boolean;
  updates: YamlUpdate[];
}

export interface WorkflowConfig {
  version: 1;
  project: {
    name: string;
    defaultBranch: string;
  };
  platformWorkflows: string;
  ci: CiConfig;
  containers: {
    registry: string;
    components: Component[];
  };
  deployment: {
    staging: EnvironmentConfig;
    production: EnvironmentConfig;
    preview: {
      enabled: boolean;
    };
  };
}

export interface GeneratedFile {
  path: string;
  content: string;
}

