import { readFileSync, unlinkSync } from 'fs';
import { Filesystem, Env } from '../src/Filesystem';
import { fixturePath, projectPath } from './helpers';

describe('Filesystem', () => {
    const systemPath = new Env(
        [fixturePath('bin').fsPath, fixturePath('usr/local/bin').fsPath].join(
            ':'
        ),
        ':'
    );

    const files = new Filesystem(systemPath);

    it('get content from file', async () => {
        const uri = projectPath('tests/AssertionsTest.php').fsPath;

        const contents = await files.get(uri);

        expect(contents).toContain(readFileSync(uri).toString());
    });

    it('put content to file', async () => {
        const uri = fixturePath('write-file.txt').fsPath;

        expect(await files.put(uri, 'write file')).toBeTruthy();

        unlinkSync(uri);
    });

    it('which ls', async () => {
        expect(await files.which(['ls.exe', 'ls'])).toBe(
            fixturePath('bin/ls').fsPath
        );
    });

    it('which cmd.cmd', async () => {
        const systemPath = new Env(
            [
                fixturePath('bin').fsPath,
                fixturePath('usr/local/bin').fsPath,
            ].join(';'),
            ';',
            ['.cmd']
        );
        const files = new Filesystem(systemPath);
        expect(await files.which('cmd')).toBe(
            fixturePath('usr/local/bin/cmd.cmd').fsPath
        );
    });

    it('findUp types/php-parser.d.ts', async () => {
        const file = await files.findUp('types/php-parser.d.ts', __filename);

        expect(file).toContain(
            fixturePath('../../types/php-parser.d.ts').fsPath
        );
    });

    it('lineAt', async () => {
        const uri = projectPath('tests/AssertionsTest.php');

        const line = await files.lineAt(uri, 13);

        expect(line).toContain('$this->assertTrue(true);');
    });

    it('lineRange', async () => {
        const uri = projectPath('tests/AssertionsTest.php').fsPath;

        const range = await files.lineRange(uri, 13);

        expect(range).toEqual({
            end: { line: 13, character: 32 },
            start: { line: 13, character: 8 },
        });
    });

    it('lineLocation', async () => {
        const uri = projectPath('tests/AssertionsTest.php');

        const range = await files.lineLocation(uri, 13);

        expect(range).toEqual({
            uri: uri.with({ scheme: 'file' }).toString(),
            range: {
                end: { line: 13, character: 32 },
                start: { line: 13, character: 8 },
            },
        });
    });
});
