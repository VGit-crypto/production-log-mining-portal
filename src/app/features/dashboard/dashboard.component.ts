import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { createLoader } from '../../core/utils/data-loader';
import { DashboardService } from '../../services/dashboard.service';
import { BarChartComponent, DonutChartComponent, LineChartComponent } from '../../shared/charts/charts';
import {
  EmptyStateComponent,
  ErrorBoundaryComponent,
  PageHeaderComponent,
  StatCardComponent,
} from '../../shared/components/components';

@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink, MatButtonModule, MatCardModule, MatIconModule,
    PageHeaderComponent, StatCardComponent, ErrorBoundaryComponent, EmptyStateComponent,
    BarChartComponent, DonutChartComponent, LineChartComponent,
  ],
  templateUrl: './dashboard.component.html',
  styles: `
    mat-card-content { padding-top: 8px; }
    mat-card-title { font-size: 16px; font-weight: 600; padding-bottom: 8px; }
  `,
})
export class DashboardComponent {
  private readonly svc = inject(DashboardService);
  protected readonly metrics = createLoader(() => this.svc.getMetrics());
}
