#!/usr/bin/env node

import { existsSync, lstatSync, mkdirSync, writeFileSync } from "fs";
import { dirname, join, relative, resolve } from "path";
import { Project, SourceFile } from "ts-morph";

// Expected usage : node dist/generate-types.js <schemasGlob> <outputFile>


// TODO : should handle the case where a type is only a library wrapper type that might be unknown after extraction, thus should not be included
// e.g. :
// type MyType = SomeLibType<OtherType>;
// In this case, we should extract OtherType but not SomeLibType
// so result would be :
// type MyType = OtherType;

/**
 * 
 */
async function main(): Promise<void> {
    const [PROJECT_PATH, SCHEMAS_PATH, OUTPUT_PATH] = verifyArguments();

    const project = new Project({
        tsConfigFilePath: join(PROJECT_PATH, "tsconfig.json"),
    });

    project.addSourceFilesAtPaths(SCHEMAS_PATH);

    const output: string[] = [];
    const imports: Map<string, Set<string>> = new Map<string, Set<string>>(); // modulePath -> Set<typeName>
    const exportedTypes: Set<string> = new Set<string>();

    // First pass: collect all exported types
    for(const sourceFile of project.getSourceFiles()) {
        for(const cls of sourceFile.getClasses()) {
            const name = cls.getName();
            
            if(name)
                exportedTypes.add(name);
        }
    }

    treatFolder(project, exportedTypes, imports, output);

    const finalCode = `// AUTO-GENERATED FILE - DO NOT EDIT

${output.join("\n")}
`;

    writeFileSync(OUTPUT_PATH, finalCode, { encoding: "utf-8" });
    console.log(`✅ Types generated at: ${OUTPUT_PATH}`);
}

/**
 * 
 */
function verifyArguments(): [string, string, string] {
    const PROJECT_PATH = process.cwd();
    console.log(`Project : ${PROJECT_PATH}`);
    const [schemasGlob, outputFile] = process.argv.slice(2);


    if(!schemasGlob || !outputFile) {
        console.error("❌ Usage: npm run generate:types -- <schemasDir> <outputDir>");
        console.error("   Example: npm run generate:types -- \"back/src/schemas\" \"frontend/src/models\"");
        process.exit(1);
    }

    if(!existsSync(schemasGlob) || !lstatSync(schemasGlob).isDirectory()) {
        console.error(`❌ The provided schemas path does not exist or is not a directory: ${schemasGlob}`);
        process.exit(1);
    }

    if(/\.[^/\\]+$/.test(outputFile)) {
        console.error(`❌ The provided output path should be a directory, not a file: ${outputFile}`);
        process.exit(1);
    }

    const SCHEMAS_PATH = resolve(schemasGlob + "/**/*.ts");
    const OUTPUT_PATH = join(outputFile, "generated-types.ts");

    if(!existsSync(outputFile)) {
        console.log(`📁 Creating output directory: ${outputFile}`);
        mkdirSync(outputFile, { recursive: true });
    }

    return [PROJECT_PATH, SCHEMAS_PATH, OUTPUT_PATH];
}

/**
 * 
 */
function getImportPath(from: SourceFile, to: SourceFile): string {
    const fromDir = dirname(from.getFilePath());
    const toFile = to.getFilePath();
    
    let relPath = relative(fromDir, toFile).replace(/\\/g, "/");

    if(!relPath.startsWith("."))
        relPath = "./" + relPath;
    
    return relPath.replace(/\.ts$/, "");
}

/**
 * 
 */
function treatFolder(
    project: Project,
    exportedTypes: Set<string>,
    dependentImports: Map<string, Set<string>>,
    output: string[],
): void {
    // Second pass: generate types and collect imports
    for(const sourceFile of project.getSourceFiles()) {
        treatFile(project, sourceFile, exportedTypes, dependentImports, output);
    }

    // Recursively handle dependent imports and types
    // if a type references another type from a different file, we need to import it
    // and write its definition as well in the output file
    for(const [importPath, typeNames] of dependentImports.entries()) {
        // TODO ?
    }
}

/**
 * 
 */
function treatFile(
    project: Project,
    sourceFile: SourceFile,
    exportedTypes: Set<string>,
    dependentImports: Map<string, Set<string>>,
    output: string[],
): void {
    // Handle classes
    for(const cls of sourceFile.getClasses()) {
        const name = cls.getName();
        
        if(!name)
            continue;

        const props: string[] = [];
        const referencedTypes: Set<string> = new Set<string>();

        for(const prop of cls.getProperties()) {
            const propName = prop.getName();
            const typeNode = prop.getTypeNode();
            
            let typeText: string;

            if(typeNode) {
                typeText = typeNode.getText();
            }
            else {
                const symbol = prop.getType().getSymbol();
                typeText = symbol
                    ? symbol.getName()
                    : prop.getType().getText();
            }

            // Find referenced types (simple heuristic: match capitalized identifiers)
            const typeMatches = typeText.match(/\b[A-Z][A-Za-z0-9_]+\b/g);
            
            if(typeMatches) {
                for(const t of typeMatches) {
                    if(t !== name && exportedTypes.has(t)) {
                        referencedTypes.add(t);
                    }
                }
            }

            props.push(`  ${propName}: ${typeText};`);
        }

        // Collect imports for referenced types
        for(const refType of referencedTypes) {
            // Find the source file where this type is defined
            const refSourceFile = project.getSourceFiles().find(sf =>
                sf.getClasses().some(c => c.getName() === refType)
            );
            
            if(refSourceFile && refSourceFile !== sourceFile) {
                const importPath = getImportPath(sourceFile, refSourceFile);
                
                if(!dependentImports.has(importPath))
                    dependentImports.set(importPath, new Set());
                
                dependentImports.get(importPath)!.add(refType);
            }
        }

        if(props.length > 0) {
            output.push(`export type ${name} = {\n${props.join("\n")}\n};\n`);
        }
    }


    // Handle interfaces
    for(const iface of sourceFile.getInterfaces()) {
        const name = iface.getName();
        
        if(!name)
            continue;
        
        output.push(iface.getText() + "\n");
    }

    // Handle type aliases
    for(const typeAlias of sourceFile.getTypeAliases()) {
        const name = typeAlias.getName();
        
        if(!name)
            continue;
        
        output.push(typeAlias.getText() + "\n");
    }

    // Handle enums
    for(const enm of sourceFile.getEnums()) {
        const name = enm.getName();
        
        if(!name)
            continue;
        
        output.push(enm.getText() + "\n");
    }
}



main().catch(err => {
    console.error(err);
    process.exit(1);
});