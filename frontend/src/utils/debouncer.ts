export class Debouncer<K> {
  timeoutHandles = new Map<K, ReturnType<typeof setTimeout>>();
  timeout = 400;

  debounce(key: K, op: () => void) {
    const handle = this.timeoutHandles.get(key);
    if (handle !== undefined) clearTimeout(handle);
    this.timeoutHandles.set(key, setTimeout(op, this.timeout));
  }
}
