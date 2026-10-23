'use strict';

const fs = require('fs');
const path = require('path');

// A tiny JSON-file database. A friend group produces a few thousand rows at most,
// so keeping everything in memory and writing it out atomically is plenty.
class Store {
  constructor(file) {
    this.file = file;
    this.data = { groups: {}, members: {}, items: {}, reposts: {} };
    this.timer = null;
    if (file && fs.existsSync(file)) {
      Object.assign(this.data, JSON.parse(fs.readFileSync(file, 'utf8')));
    }
  }

  save() {
    if (!this.file || this.timer) return;
    this.timer = setTimeout(() => this.flush(), 200);
  }

  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file);
  }
}

module.exports = { Store };
