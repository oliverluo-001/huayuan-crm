import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from '../../modules/audit/audit.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const method = request.method || 'GET';
    const path = request.originalUrl || request.url || request.path || '';

    // Only log mutating requests
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return next.handle();
    }

    const user = request.user || {};
    const username = user.username || 'anonymous';
    const startedAt = Date.now();
    const ip = String(request.ip || request.socket?.remoteAddress || '').slice(0, 64);

    // Build a friendly action description
    const action = `${method} ${path}`;
    const details = JSON.stringify({
      route: request.route?.path || '',
      params: this.sanitize(request.params || {}),
      query: this.sanitize(request.query || {}),
    });

    const write = (status: 'success' | 'failed') => this.auditService.log({
      username,
      userId: user.sub ? String(user.sub) : '',
      action: status === 'failed' ? `${action} (failed)` : action,
      method,
      path: String(path).slice(0, 500),
      ip,
      status,
      durationMs: Date.now() - startedAt,
      details,
    }).catch(() => undefined);

    return next.handle().pipe(
      tap({
        next: () => {
          void write('success');
        },
        error: () => {
          void write('failed');
        },
      }),
    );
  }

  private sanitize(value: Record<string, unknown>) {
    const blocked = /pass|password|token|secret|api.?key|credential|body|content/i;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, blocked.test(key) ? '[REDACTED]' : String(item).slice(0, 200)]));
  }
}
