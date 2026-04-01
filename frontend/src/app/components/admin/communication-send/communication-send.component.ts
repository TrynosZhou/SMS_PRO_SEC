import { Component, OnInit } from '@angular/core';
import { MessageService } from '../../../services/message.service';
import { ParentManagementService } from '../../../services/parent-management.service';

@Component({
  selector: 'app-communication-send',
  templateUrl: './communication-send.component.html',
  styleUrls: ['./communication-send.component.css']
})
export class CommunicationSendComponent implements OnInit {
  scope: 'all' | 'one' = 'all';
  parentId = '';
  subject = '';
  message = '';
  file: File | null = null;

  parents: { id: string; label: string }[] = [];
  loadingParents = false;
  sending = false;
  error = '';
  success = '';

  constructor(
    private messageService: MessageService,
    private parentManagementService: ParentManagementService
  ) {}

  ngOnInit(): void {
    this.loadParents();
  }

  loadParents(): void {
    this.loadingParents = true;
    this.parentManagementService.getParents().subscribe({
      next: (res) => {
        const list = res?.parents || [];
        this.parents = list.map((p: any) => ({
          id: p.id,
          label: `${p.firstName || ''} ${p.lastName || ''}`.trim() + (p.email ? ` — ${p.email}` : '')
        }));
        this.loadingParents = false;
      },
      error: () => {
        this.loadingParents = false;
        this.error = 'Could not load parent list.';
      }
    });
  }

  onFileChange(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    this.file = input.files?.[0] || null;
  }

  clearFile(input: HTMLInputElement): void {
    input.value = '';
    this.file = null;
  }

  submit(): void {
    this.error = '';
    this.success = '';
    if (!this.subject.trim() || !this.message.trim()) {
      this.error = 'Subject and message are required.';
      return;
    }
    if (this.scope === 'one' && !this.parentId) {
      this.error = 'Select a parent.';
      return;
    }

    const fd = new FormData();
    fd.append('scope', this.scope);
    fd.append('subject', this.subject.trim());
    fd.append('message', this.message.trim());
    if (this.scope === 'one') {
      fd.append('parentId', this.parentId);
    }
    if (this.file) {
      fd.append('attachment', this.file, this.file.name);
    }

    this.sending = true;
    this.messageService.sendAdminToParents(fd).subscribe({
      next: (res) => {
        this.sending = false;
        const n = res?.sentCount ?? 0;
        this.success = res?.message || `Delivered to ${n} parent inbox(es).`;
        this.subject = '';
        this.message = '';
        this.file = null;
        const el = document.getElementById('cm-attach') as HTMLInputElement | null;
        if (el) el.value = '';
      },
      error: (err) => {
        this.sending = false;
        this.error = err?.error?.message || 'Failed to send.';
      }
    });
  }
}
