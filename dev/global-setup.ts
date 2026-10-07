import { rmSync } from 'node:fs'

export default function setup() {
  for (const suffix of ['', '-shm', '-wal', '-journal']) {
    rmSync(`./dev/test.db${suffix}`, { force: true })
  }
}
