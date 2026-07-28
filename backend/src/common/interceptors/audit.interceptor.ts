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
    const path = request.route?.path || request.path || request.url || '';

    // Only log mutating requests
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return next.handle();
    }

    const user = request.user || {};
    const username = user.username || 'anonymous';

    // Build a friendly action description
    const action = `${method} ${path}`;
    const entityType = path.split('/').filter(Boolean).join(' > ') || path;

    return next.handle().pipe(
      tap({
        next: () => {
          this.auditService.log(username, action, entityType).catch(() => {
            // Silently ignore audit logging errors
          });
        },
        error: () => {
          this.auditService
            .log(username, `${action} (failed)`, entityType)
            .catch(() => {});
        },
      }),
    );
  }
}
