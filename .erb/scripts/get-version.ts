import packageJson from '../../release/app/package.json';

const { version } = packageJson;

const now = Math.round(new Date().getTime() / 1000);

console.log(`${version}-${now}`);
