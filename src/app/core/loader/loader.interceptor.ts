// src/app/core/loader/loader.interceptor.ts
import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize } from 'rxjs/operators';
import { LoaderService } from '../../services/loader.service';

export const loaderInterceptor: HttpInterceptorFn = (req, next) => {
  const loader = inject(LoaderService);

  // Permite saltar el loader con un header opcional
  let skip = req.headers.has('X-Skip-Loader');
  const cleanReq = skip ? req.clone({ headers: req.headers.delete('X-Skip-Loader') }) : req;

  const piezasUrl = cleanReq.url.split('/');
  const endpoint = piezasUrl[piezasUrl.length - 1];
  let customMessage = `Cargando ${endpoint}`;

  if (cleanReq.url.includes('slim-existencia')) {
    customMessage = 'Cargando existencias';
  }

  if (cleanReq.url.includes('ultima-ejecucion')) {
    customMessage = 'Cargando info de última ejecución';
  }

  if (cleanReq.url.includes('ejecutar')) {
    customMessage = 'Ejecutando balanceo... espere un momento';
  }

  if (cleanReq.url.includes('cpms')) {
    customMessage = 'Cargando CPMs... espere un momento';
  }

  if (cleanReq.url.includes('all')) {
    customMessage = 'Cargando existencias con factor de conversión... espere un momento';
  }

  // customizar mensaje dependiendo de la api llamada
  if (cleanReq.url.includes('inventario')) {
    // revisar si es inventario/HGENS o inventario/HGMXL, para cortar la url por el ultimo /

    customMessage = `Cargando existencias de ${piezasUrl[piezasUrl.length - 1]}`;
  }

  if (cleanReq.url.includes('init?reset=true')) { 
    skip = true;
  }

  if (!skip) loader.inc(customMessage);

  return next(cleanReq).pipe(
    finalize(() => {
      if (!skip) loader.dec();
    })
  );
};
