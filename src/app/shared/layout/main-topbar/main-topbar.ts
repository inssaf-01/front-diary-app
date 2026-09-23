import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MainNavComponent } from '../main-nav/main-nav';

@Component({
  selector: 'app-main-topbar',
  standalone: true,
  imports: [RouterLink, MainNavComponent],
  templateUrl: './main-topbar.html',
  styleUrl: './main-topbar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MainTopbarComponent {
  @Input() firstName = '';
  @Input() fullName = '';
  @Input() avatarUrl = '';
  @Input() status = '';
  @Output() addClicked = new EventEmitter<void>();

  constructor(private readonly router: Router) {}

  navigateToProfile(): void {
    void this.router.navigateByUrl('/profile');
  }
}
