import ts from 'typescript';
import { copyFileSync, mkdirSync, existsSync, rmSync } from 'fs';
import path from 'path';

const loadTsConfig = (configPath: string): ts.ParsedCommandLine => {
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) {
    throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'));
  }
  const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(configPath));
  if (parsedConfig.errors.length > 0) {
    parsedConfig.errors.forEach(error => {
      console.error(ts.flattenDiagnosticMessageText(error.messageText, '\n'));
    });
    throw new Error('Errors in tsconfig.json');
  }
  return parsedConfig;
};

interface TranspileOptions {
  fileNames: string[];
  options: ts.CompilerOptions;
}

const transpileWithTsConfig = (inputDir: string, outputDir: string, options: TranspileOptions): void => {
  const program = ts.createProgram(options.fileNames, {
    ...options.options,
    outDir: outputDir,
  });
  const emitResult = program.emit();

  const diagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);
  if (diagnostics.length > 0) {
    diagnostics.forEach(diagnostic => {
      if (diagnostic.file && diagnostic.start !== undefined) {
        const { line, character } = ts.getLineAndCharacterOfPosition(diagnostic.file, diagnostic.start);
        const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
        console.error(`${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`);
      } else {
        console.error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
      }
    });
    throw new Error('Compilation errors occurred.');
  }
};


const main = () => {
  const srcDir = 'src';
  const distDir = 'dist';
  const esmDir = `${distDir}/esm`;
  const cjsDir = `${distDir}/cjs`;

  const tsConfigPath = path.join(process.cwd(), 'tsconfig.json');

  // Load tsconfig.json
  const tsConfig = loadTsConfig(tsConfigPath);
  const scriptDir = path.join(process.cwd(), 'script').replace(/\\/g, '/');
  const filteredFiles: string[] = [];
  for (const file of tsConfig.fileNames) {
    if (!file.startsWith(scriptDir)) {
      filteredFiles.push(file);
    }
  }

  // Clean up the dist directory
  if (existsSync(distDir)) {
    rmSync(distDir, { recursive: true, force: true });
  }

  console.log('Transpiling ESM...');
  
  // Transpile for ESM
  mkdirSync(esmDir, { recursive: true });
  transpileWithTsConfig(srcDir, esmDir, {
    ...tsConfig,
    options: { ...tsConfig.options, module: ts.ModuleKind.ESNext },
    fileNames: filteredFiles,
  });

  console.log('Transpiling CJS...');

  // Transpile for CommonJS
  mkdirSync(cjsDir, { recursive: true });
  transpileWithTsConfig(srcDir, cjsDir, {
    ...tsConfig,
    options: { ...tsConfig.options, module: ts.ModuleKind.CommonJS },
    fileNames: filteredFiles,
  });

  // Copy additional files
  copyFileSync(`${srcDir}/package-esm.json`, `${esmDir}/package.json`);
  copyFileSync(`${srcDir}/package-cjs.json`, `${cjsDir}/package.json`);

  console.log('Build process completed successfully.');
};

main();