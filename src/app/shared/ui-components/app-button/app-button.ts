import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

export type AppButtonType = 'button' | 'submit' | 'reset';

export type AppButtonIconPosition = 'left' | 'right' | 'top' | 'bottom';

export type AppButtonSeverity =
  'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'danger' | 'contrast';

@Component({
  selector: 'app-button',
  standalone: true,
  templateUrl: './app-button.html',
  styleUrl: './app-button.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppButtonComponent {
  @Input() label = '';
  @Input() icon?: string;
  @Input() iconPosition: AppButtonIconPosition = 'right';
  @Input() type: AppButtonType = 'button';
  @Input() severity: AppButtonSeverity = 'primary';
  @Input() loading = false;
  @Input() disabled = false;
  @Input() fluid = true;
  @Input() ariaLabel?: string;

  @Output() buttonClick = new EventEmitter<MouseEvent>();

  handleClick(event: MouseEvent): void {
    if (this.disabled || this.loading) {
      event.preventDefault();
      return;
    }

    this.buttonClick.emit(event);
  }
}
