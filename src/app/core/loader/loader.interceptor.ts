// src/app/core/loader/loader.interceptor.ts
import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize } from 'rxjs/operators';
import { LoaderService } from '../../services/loader.service';

export const loaderInterceptor: HttpInterceptorFn = (req, next) => {
  const loader = inject(LoaderService);

  // Permite saltar el loader con un header opcional
  const skip = req.headers.has('X-Skip-Loader');
  const cleanReq = skip ? req.clone({ headers: req.headers.delete('X-Skip-Loader') }) : req;

  if (!skip) loader.inc();

  return next(cleanReq).pipe(
    finalize(() => {
      if (!skip) loader.dec();
    })
  );
};
