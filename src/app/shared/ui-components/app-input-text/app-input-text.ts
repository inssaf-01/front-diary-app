import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  forwardRef,
  Input,
} from '@angular/core';

import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export type AppInputType = 'text' | 'email' | 'password' | 'search' | 'tel';

@Component({
  selector: 'app-input-text',
  standalone: true,
  templateUrl: './app-input-text.html',
  styleUrl: './app-input-text.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => AppInputTextComponent),
      multi: true,
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppInputTextComponent implements ControlValueAccessor {
  @Input({ required: true }) id = '';
  @Input() label = '';
  @Input() type: AppInputType = 'text';
  @Input() placeholder = '';
  @Input() icon = '';
  @Input() autocomplete = 'off';
  @Input() invalid = false;
  @Input() errorMessage = '';
  @Input() showPasswordToggle = false;

  value = '';
  disabled = false;
  passwordVisible = false;

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(private readonly cdr: ChangeDetectorRef) {}

  get resolvedType(): AppInputType {
    if (this.type === 'password' && this.passwordVisible) {
      return 'text';
    }

    return this.type;
  }

  get errorId(): string {
    return `${this.id}-error`;
  }

  writeValue(value: string | null): void {
    this.value = value ?? '';
    this.cdr.markForCheck();
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled = disabled;
    this.cdr.markForCheck();
  }

  handleInput(event: Event): void {
    const input = event.target as HTMLInputElement;

    this.value = input.value;
    this.onChange(this.value);
  }

  handleBlur(): void {
    this.onTouched();
  }

  togglePasswordVisibility(): void {
    this.passwordVisible = !this.passwordVisible;
  }
}
