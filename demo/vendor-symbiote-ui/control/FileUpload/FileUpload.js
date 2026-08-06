import Symbiote from '@symbiotejs/symbiote';
import template from './FileUpload.tpl.js';
import css from './FileUpload.css.js';

class FileUpload extends Symbiote {
  static observedAttributes = ['disabled', 'multiple', 'accept', 'max-size', 'placeholder'];

  #files = [];

  #onDropzoneClick = () => {
    if (this.disabled) return;
    this.ref.fileInput?.click();
  };

  #onDropzoneKeydown = (event) => {
    if (this.disabled) return;
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      this.ref.fileInput?.click();
    }
  };

  #onFileInputChange = (event) => {
    const fileList = event.target.files;
    if (fileList) {
      this.#processFiles(Array.from(fileList));
    }
  };

  #onDragOver = (event) => {
    event.preventDefault();
    if (this.disabled) return;
    this.ref.dropzone?.setAttribute('data-dragover', '');
  };

  #onDragLeave = () => {
    this.ref.dropzone?.removeAttribute('data-dragover');
  };

  #onDrop = (event) => {
    event.preventDefault();
    this.ref.dropzone?.removeAttribute('data-dragover');
    if (this.disabled) return;
    if (event.dataTransfer?.files) {
      this.#processFiles(Array.from(event.dataTransfer.files));
    }
  };

  constructor() {
    super();
    this.init$ = {
      placeholder: 'Drag & drop files or click to upload',
    };
  }

  connectedCallback() {
    super.connectedCallback?.();
    this.ref.dropzone?.addEventListener('click', this.#onDropzoneClick);
    this.ref.dropzone?.addEventListener('keydown', this.#onDropzoneKeydown);
    this.ref.dropzone?.addEventListener('dragover', this.#onDragOver);
    this.ref.dropzone?.addEventListener('dragleave', this.#onDragLeave);
    this.ref.dropzone?.addEventListener('drop', this.#onDrop);
    this.ref.fileInput?.addEventListener('change', this.#onFileInputChange);

    this.#syncAttributes();
  }

  disconnectedCallback() {
    this.ref.dropzone?.removeEventListener('click', this.#onDropzoneClick);
    this.ref.dropzone?.removeEventListener('keydown', this.#onDropzoneKeydown);
    this.ref.dropzone?.removeEventListener('dragover', this.#onDragOver);
    this.ref.dropzone?.removeEventListener('dragleave', this.#onDragLeave);
    this.ref.dropzone?.removeEventListener('drop', this.#onDrop);
    this.ref.fileInput?.removeEventListener('change', this.#onFileInputChange);
    super.disconnectedCallback?.();
  }

  get files() {
    return this.#files;
  }

  get disabled() {
    return this.hasAttribute('disabled');
  }

  set disabled(val) {
    this.toggleAttribute('disabled', Boolean(val));
  }

  get multiple() {
    return this.hasAttribute('multiple');
  }

  set multiple(val) {
    this.toggleAttribute('multiple', Boolean(val));
  }

  get accept() {
    return this.getAttribute('accept') || '';
  }

  set accept(val) {
    this.setAttribute('accept', String(val));
  }

  get maxSize() {
    return Number(this.getAttribute('max-size')) || Infinity;
  }

  set maxSize(val) {
    this.setAttribute('max-size', String(val));
  }

  get placeholder() {
    return this.getAttribute('placeholder') || 'Drag & drop files or click to upload';
  }

  set placeholder(val) {
    this.setAttribute('placeholder', String(val));
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    this.#syncAttributes();
  }

  #syncAttributes() {
    this.$.placeholder = this.placeholder;
    if (this.ref.fileInput) {
      this.ref.fileInput.multiple = this.multiple;
      this.ref.fileInput.accept = this.accept;
      this.ref.fileInput.disabled = this.disabled;
    }
    if (this.ref.dropzone) {
      this.ref.dropzone.setAttribute('aria-label', this.placeholder);
      this.ref.dropzone.toggleAttribute('data-disabled', this.disabled);
      this.ref.dropzone.setAttribute('aria-disabled', String(this.disabled));
      this.ref.dropzone.tabIndex = this.disabled ? -1 : 0;
    }
  }

  #processFiles(newFiles) {
    let accepted = [];
    const max = this.maxSize;

    for (let file of newFiles) {
      if (!this.#acceptsFile(file)) {
        this.#emitFileError(file, 'File type is not accepted.');
        continue;
      }
      if (file.size > max) {
        this.#emitFileError(file, 'File size exceeds maximum allowed.');
        continue;
      }
      accepted.push(file);
    }

    if (accepted.length === 0) return;

    if (this.multiple) {
      this.#files = [...this.#files, ...accepted];
    } else {
      this.#files = accepted.slice(0, 1);
    }

    this.#renderFileList();

    const added = accepted.length;
    this.#announce(`${added} file${added === 1 ? '' : 's'} added. ${this.#files.length} selected.`);

    this.dispatchEvent(new CustomEvent('sn-file-select', {
      bubbles: true,
      composed: true,
      detail: { files: this.#files }
    }));
  }

  #acceptsFile(file) {
    const accept = this.accept
      .split(',')
      .map((token) => token.trim().toLowerCase())
      .filter(Boolean);
    if (accept.length === 0) return true;

    const name = String(file.name || '').toLowerCase();
    const type = String(file.type || '').toLowerCase();
    return accept.some((token) => {
      if (token.startsWith('.')) return name.endsWith(token);
      if (token.endsWith('/*')) return type.startsWith(token.slice(0, -1));
      return type === token;
    });
  }

  #emitFileError(file, error) {
    this.dispatchEvent(new CustomEvent('sn-file-error', {
      bubbles: true,
      composed: true,
      detail: { file, error }
    }));
  }

  #renderFileList() {
    const list = this.ref.fileList;
    if (!list) return;

    list.innerHTML = '';
    this.#files.forEach((file, index) => {
      const item = document.createElement('div');
      item.className = 'sn-file-item';

      const info = document.createElement('div');
      info.className = 'sn-file-item-info';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'sn-file-item-name';
      nameSpan.textContent = file.name;

      const sizeSpan = document.createElement('span');
      sizeSpan.className = 'sn-file-item-size';
      sizeSpan.textContent = this.#formatBytes(file.size);

      info.appendChild(nameSpan);
      info.appendChild(sizeSpan);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'sn-file-item-remove';
      removeBtn.setAttribute('aria-label', `Remove ${file.name}`);
      const removeIcon = document.createElement('span');
      removeIcon.className = 'material-symbols-outlined';
      removeIcon.setAttribute('aria-hidden', 'true');
      removeIcon.textContent = 'close';
      removeBtn.appendChild(removeIcon);
      removeBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        this.#removeFileIndex(index);
      });

      item.appendChild(info);
      item.appendChild(removeBtn);
      list.appendChild(item);
    });
  }

  #announce(message) {
    if (this.ref.liveRegion) {
      this.ref.liveRegion.textContent = message;
    }
  }

  #removeFileIndex(index) {
    const removedFile = this.#files[index];
    this.#files.splice(index, 1);
    this.#renderFileList();

    this.#announce(`${removedFile?.name || 'File'} removed. ${this.#files.length} selected.`);

    this.dispatchEvent(new CustomEvent('sn-file-remove', {
      bubbles: true,
      composed: true,
      detail: { file: removedFile, files: this.#files }
    }));
  }

  #formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

FileUpload.template = template;
FileUpload.rootStyles = css;
FileUpload.reg('sn-file-upload');

export default FileUpload;
