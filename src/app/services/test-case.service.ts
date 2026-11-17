import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../core/services/api.service';
import { PipelineStatus, TestCase } from '../models';
import { SKIP_LOADING } from '../core/interceptors/interceptors';
import { HttpContext } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class TestCaseService {
  private readonly api = inject(ApiService);

  getAll(clusterId?: string): Observable<TestCase[]> {
    return this.api.get<TestCase[]>('/test-cases', { clusterId });
  }

  /** Background AI generation progress (polled; does not trigger the global loading bar). */
  getStatus(): Observable<PipelineStatus> {
    return this.api.get<PipelineStatus>('/pipeline/status', undefined, new HttpContext().set(SKIP_LOADING, true));
  }

  generate(clusterId: string): Observable<TestCase[]> {
    return this.api.post<TestCase[]>(`/clusters/${encodeURIComponent(clusterId)}/test-cases`);
  }
}
