import * as vscode from 'vscode';
import { TestCase, testData, TestFile } from './testTree';
import { parse, TestCase as TestCase2, TestSuite } from './phpunit/parser';
import { Command } from './phpunit/command';
import {
    Result,
    TestEvent,
    TestFailed,
    TestFinished,
    TestIgnored,
    TestResult,
} from './phpunit/problem-matcher';

export const testData2 = new WeakMap<vscode.TestItem, TestSuite | TestCase2>();

export async function activate(context: vscode.ExtensionContext) {
    const ctrl = vscode.tests.createTestController('mathTestController', 'Markdown Math');
    context.subscriptions.push(ctrl);

    const runHandler = (
        request: vscode.TestRunRequest /*, cancellation: vscode.CancellationToken*/
    ) => {
        const queue: { test: vscode.TestItem; data: any }[] = [];
        const run = ctrl.createTestRun(request);
        // map of file uris to statements on each line:
        const coveredLines = new Map<
            /* file uri */ string,
            (vscode.StatementCoverage | undefined)[]
        >();

        const discoverTests = async (tests: Iterable<vscode.TestItem>) => {
            for (const test of tests) {
                if (request.exclude?.includes(test)) {
                    continue;
                }

                run.enqueued(test);
                test.children.forEach((child) => run.enqueued(child));

                const folder = vscode.workspace.workspaceFolders![0];
                const rootPath = folder.uri.fsPath;
                const command = new Command({
                    cwd: rootPath,
                });
                command.on('test', (result: Result) => {
                    if (!result.hasOwnProperty('event') || !result.hasOwnProperty('id')) {
                        return;
                    }

                    result = result as TestResult;

                    if ([TestEvent.testStarted].includes(result.event)) {
                        const id = (result as any).id.replace(/\swith\sdata\sset\s#\d+/, '');
                        const child = test.children.get(id)!;
                        run.started(child);
                    }

                    if ([TestEvent.testFailed].includes(result.event)) {
                        const id = (result as any).id.replace(/\swith\sdata\sset\s#\d+/, '');
                        const child = test.children.get(id)!;
                        const message = vscode.TestMessage.diff(
                            (result as TestFailed).message!,
                            (result as TestFailed).expected!,
                            (result as TestFailed).actual!
                        );
                        // const message = {
                        //     message: (result as TestFailed).message,
                        //     actualOutput: (result as TestFailed).actual,
                        //     expectedOutput: (result as TestFailed).expected,
                        // };
                        const details = (result as TestFailed).details;
                        if (details.length > 0) {
                            const range = new vscode.Range(
                                new vscode.Position(details[0].line - 1, 0),
                                new vscode.Position(details[0].line - 1, 0)
                            );
                            message.location = new vscode.Location(child.uri!, range);
                        }
                        run.failed(child, message, (result as TestFailed).duration);
                    }

                    if ([TestEvent.testIgnored].includes(result.event)) {
                        const id = (result as any).id.replace(/\swith\sdata\sset\s#\d+/, '');
                        const child = test.children.get(id)!;
                        run.skipped(child);
                    }

                    if ([TestEvent.testFinished].includes(result.event)) {
                        const id = (result as any).id.replace(/\swith\sdata\sset\s#\d+/, '');
                        const child = test.children.get(id)!;
                        run.passed(child, (result as TestFinished).duration);
                    }
                });

                // '--filter',
                // '^.*::(test_passed|test_failed)( with data set .*)?$'
                // if (process.platform === 'win32') {
                //     filter = `"${filter}"`;
                // } else {
                //     filter = `'${filter}'`;
                // }

                const testData = testData2.get(test) as TestSuite;
                // const depends = testData.children
                //     .filter((test) => test.annotations.depends)
                //     .reduce((depends, test) => {
                //         return depends.concat(test.annotations.depends!);
                //     }, [] as string[]);

                // if (depends.length > 0) {
                //     filter = `--filter '^.*::(${depends.join('|')})( with data set .*)?$'`;
                // }

                let filter = '';
                const cmd = `php vendor/bin/phpunit ${testData?.fsPath} ${filter}`.trim();
                await command.execute(cmd);
                run.end();

                // const data = testData.get(test);
                // if (data instanceof TestCase) {
                //     run.enqueued(test);
                //     queue.push({ test, data });
                // } else {
                //     if (data instanceof TestFile && !data.didResolve) {
                //         await data.updateFromDisk(ctrl, test);
                //     }
                //
                //     await discoverTests(gatherTestItems(test.children));
                // }
                //
                // if (test.uri && !coveredLines.has(test.uri.toString())) {
                //     try {
                //         const lines = (await getContentFromFilesystem(test.uri)).split('\n');
                //         coveredLines.set(
                //             test.uri.toString(),
                //             lines.map((lineText, lineNo) =>
                //                 lineText.trim().length
                //                     ? new vscode.StatementCoverage(
                //                           0,
                //                           new vscode.Position(lineNo, 0)
                //                       )
                //                     : undefined
                //             )
                //         );
                //     } catch {
                //         // ignored
                //     }
                // }
            }
        };

        const runTestQueue = async () => {
            // for (const { test, data } of queue) {
            //     run.appendOutput(`Running ${test.id}\r\n`);
            //     if (cancellation.isCancellationRequested) {
            //         run.skipped(test);
            //     } else {
            //         run.started(test);
            //         await data.run(test, run);
            //     }
            //     const lineNo = test.range!.start.line;
            //     const fileCoverage = coveredLines.get(test.uri!.toString());
            //     if (fileCoverage) {
            //         fileCoverage[lineNo]!.executionCount++;
            //     }
            //     run.appendOutput(`Completed ${test.id}\r\n`);
            // }
            // run.end();
        };

        run.coverageProvider = {
            provideFileCoverage() {
                const coverage: vscode.FileCoverage[] = [];
                for (const [uri, statements] of coveredLines) {
                    coverage.push(
                        vscode.FileCoverage.fromDetails(
                            vscode.Uri.parse(uri),
                            statements.filter((s): s is vscode.StatementCoverage => !!s)
                        )
                    );
                }

                return coverage;
            },
        };

        discoverTests(request.include ?? gatherTestItems(ctrl.items)).then(runTestQueue);
    };

    ctrl.refreshHandler = async () => {
        await Promise.all(
            getWorkspaceTestPatterns().map(({ pattern }) => findInitialFiles(ctrl, pattern))
        );
    };

    ctrl.createRunProfile('Run Tests', vscode.TestRunProfileKind.Run, runHandler, true);

    ctrl.resolveHandler = async (item) => {
        if (!item) {
            context.subscriptions.push(...startWatchingWorkspace(ctrl));
            return;
        }

        const data = testData.get(item);
        if (data instanceof TestFile) {
            await data.updateFromDisk(ctrl, item);
        }
    };

    function updateNodeForDocument(e: vscode.TextDocument) {
        if (e.uri.scheme !== 'file') {
            return;
        }

        if (!e.uri.path.endsWith('.php')) {
            return;
        }

        getOrCreateFile(ctrl, e.uri);
        // const { file, data } = getOrCreateFile(ctrl, e.uri);
        // data.updateFromContents(ctrl, e.getText(), file);
    }

    for (const document of vscode.workspace.textDocuments) {
        updateNodeForDocument(document);
    }

    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(updateNodeForDocument),
        vscode.workspace.onDidChangeTextDocument((e) => updateNodeForDocument(e.document))
    );
}

async function getOrCreateFile(controller: vscode.TestController, uri: vscode.Uri) {
    const existing = controller.items.get(uri.toString());
    if (existing) {
        return;
    }

    const textDecoder = new TextDecoder('utf-8');
    const text = textDecoder.decode(await vscode.workspace.fs.readFile(uri));
    const suites = parse(text, uri.fsPath);

    if (suites) {
        suites.forEach((suite) => {
            const parent = controller.createTestItem(suite.id, suite.qualifiedClass, uri);
            parent.canResolveChildren = true;

            testData2.set(parent, suite);
            parent.children.replace(
                suite.children.map((test, index) => {
                    const children = controller.createTestItem(test.id, test.method, uri);
                    children.canResolveChildren = false;
                    children.sortText = `${index}`;
                    testData2.set(children, test);
                    controller.items.add(children);

                    return children;
                })
            );

            controller.items.add(parent);
        });
    }

    return;

    // const file = controller.createTestItem(uri.toString(), uri.path.split('/').pop()!, uri);
    // controller.items.add(file);
    //
    // const data = new TestFile();
    // testData.set(file, data);
    //
    // file.canResolveChildren = true;
    // return { file, data };
}

function gatherTestItems(collection: vscode.TestItemCollection) {
    const items: vscode.TestItem[] = [];
    collection.forEach((item) => items.push(item));
    return items;
}

function getWorkspaceTestPatterns() {
    if (!vscode.workspace.workspaceFolders) {
        return [];
    }

    return vscode.workspace.workspaceFolders.map((workspaceFolder) => ({
        workspaceFolder,
        pattern: new vscode.RelativePattern(workspaceFolder, 'tests/**/*.php'),
    }));
}

async function findInitialFiles(controller: vscode.TestController, pattern: vscode.GlobPattern) {
    for (const file of await vscode.workspace.findFiles(pattern)) {
        getOrCreateFile(controller, file);
    }
}

function startWatchingWorkspace(controller: vscode.TestController) {
    return getWorkspaceTestPatterns().map(({ pattern }) => {
        const watcher = vscode.workspace.createFileSystemWatcher(pattern);

        watcher.onDidCreate((uri) => getOrCreateFile(controller, uri));
        watcher.onDidChange((uri) => getOrCreateFile(controller, uri));
        // watcher.onDidChange((uri) => {
        //     const {file, data} = getOrCreateFile(controller, uri);
        //     if (data.didResolve) {
        //         data.updateFromDisk(controller, file);
        //     }
        // });
        watcher.onDidDelete((uri) => controller.items.delete(uri.toString()));

        findInitialFiles(controller, pattern);

        return watcher;
    });
}
