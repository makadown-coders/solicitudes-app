import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  LucideAngularModule,
  Search,
  ShieldAlert,
  Upload,
  X,
} from 'lucide-angular';
import { resolveRhRoleContext } from '../../../core/auth/rh-access.guard';
import { SessionStore } from '../../../core/auth/session-store.service';
import {
  RhAsistenciaEstadoControl,
  RhPersonaAdminDto,
  RhService,
  RhUnidadAutorizada,
} from '../../../services/rh.service';
import {
  normalizeNameForMatch,
  RhAsistenciaConciliacion2026Service,
  RhConciliacionFilaExcel,
} from './rh-asistencia-conciliacion-2026.service';
import { RhUnidadAutocompleteComponent } from '../shared/rh-unidad-autocomplete.component';

@Component({
  selector: 'app-rh-migracion-asistencias-2026',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LucideAngularModule, RhUnidadAutocompleteComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './rh-migracion-asistencias-2026.component.html',
})
export class RhMigracionAsistencias2026Component implements OnInit {
  private readonly sessionStore = inject(SessionStore);
  private readonly rhService = inject(RhService);
  private readonly conciliacionService = inject(RhAsistenciaConciliacion2026Service);

  readonly icons = {
    alert: AlertCircle,
    warning: AlertTriangle,
    back: ArrowLeft,
    check: CheckCircle2,
    download: Download,
    excel: FileSpreadsheet,
    loader: Loader2,
    search: Search,
    shieldAlert: ShieldAlert,
    upload: Upload,
    clear: X,
  };

  readonly isRhGlobal = computed<boolean>(() => {
    const ctx = resolveRhRoleContext(this.sessionStore.user());
    return ctx !== null && ctx.grantedBy === 'RECURSOS_HUMANOS' && ctx.scope === 'GLOBAL';
  });

  readonly loadingCatalogs = signal<boolean>(false);
  readonly catalogsReady = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);
  readonly infoMessage = signal<string | null>(null);

  readonly archivoNombre = signal<string>('');
  readonly archivoHash = signal<string>('');
  readonly archivoBase64 = signal<string>('');
  readonly sheetName = signal<string>('');

  // Confirmación e importación auditada (RH-ASIS-05B2)
  readonly confirmModalOpen = signal<boolean>(false);
  readonly importing = signal<boolean>(false);
  readonly importResult = signal<{
    lote_id: string;
    idempotente: boolean;
    importados: number;
    ya_existentes: number;
    periodos_afectados: number[];
  } | null>(null);

  readonly unidades = signal<RhUnidadAutorizada[]>([]);
  readonly personasCatalogo = signal<RhPersonaAdminDto[]>([]);
  readonly existingByPersonaMes = signal<Map<string, RhAsistenciaEstadoControl>>(new Map());
  readonly filas = signal<RhConciliacionFilaExcel[]>([]);

  // Filtros de revisión
  readonly filtroEstado = signal<string>('');
  readonly filtroTexto = signal<string>('');
  readonly filtroUnidadCandidatosId = signal<number | null>(null);

  // Selector inteligente de trabajador (modal compacto por fila)
  readonly selectorRowKey = signal<string | null>(null);
  readonly selectorQuery = signal<string>('');

  readonly resumen = computed(() => this.conciliacionService.buildPreviewSummary(this.filas()));

  readonly filasVisibles = computed<RhConciliacionFilaExcel[]>(() => {
    const est = this.filtroEstado();
    const q = normalizeNameForMatch(this.filtroTexto());
    return this.filas().filter((f) => {
      if (est === 'VACANTES') return f.esVacante;
      if (est && est !== 'VACANTES' && f.estadoIdentidad !== est) return false;
      if (q && !f.nombreNormalizado.includes(q) && !normalizeNameForMatch(f.puesto).includes(q)) {
        return false;
      }
      return true;
    });
  });

  readonly selectorResultados = computed<RhPersonaAdminDto[]>(() => {
    const q = normalizeNameForMatch(this.selectorQuery());
    const uFilter = this.filtroUnidadCandidatosId();
    const all = this.personasCatalogo();
    const filtered = all.filter((p) => {
      if (uFilter !== null && p.unidad_medica_id !== uFilter) {
        return false;
      }
      if (!q) return true;
      return (
        normalizeNameForMatch(p.nombre_completo).includes(q) ||
        normalizeNameForMatch(p.cargo).includes(q) ||
        String(p.persona_id) === q
      );
    });
    return filtered.slice(0, 15);
  });

  ngOnInit(): void {
    if (this.isRhGlobal()) {
      void this.loadReadOnlyCatalogs();
    }
  }

  async loadReadOnlyCatalogs(): Promise<void> {
    this.loadingCatalogs.set(true);
    this.catalogsReady.set(false);
    this.errorMessage.set(null);
    try {
      const unidadesResp = await this.rhService.obtenerUnidadesAutorizadas();
      this.unidades.set(unidadesResp.unidades ?? []);

      // Paginación real completa de public.persona (sin limitarse a página 1)
      const allPersonas: RhPersonaAdminDto[] = [];
      let pPage = 1;
      const pPageSize = 100;
      let pTotal = 0;
      do {
        const resp = await this.rhService.listarPersonasPadron({ page: pPage, pageSize: pPageSize });
        const batch = resp.items ?? [];
        allPersonas.push(...batch);
        pTotal = Number(resp.total ?? allPersonas.length);
        if (batch.length === 0) break;
        pPage++;
      } while (allPersonas.length < pTotal);
      this.personasCatalogo.set(allPersonas);

      // Paginación real completa de los 12 meses de 2026 para detectar conflictos en cualquier página
      const existingMap = new Map<string, RhAsistenciaEstadoControl>();
      for (let mes = 1; mes <= 12; mes++) {
        let sPage = 1;
        const sPageSize = 100;
        let fetched = 0;
        let sTotal = 0;
        do {
          const resp = await this.rhService.getAsistenciaSeguimiento({
            anio: 2026,
            mes,
            page: sPage,
            pageSize: sPageSize,
          });
          const items = resp.items ?? [];
          for (const item of items) {
            if (item.tiene_registro_control && item.estado_control) {
              existingMap.set(`${item.persona_id}:${mes}`, item.estado_control);
            }
          }
          fetched += items.length;
          sTotal = Number(resp.total ?? fetched);
          if (items.length === 0) break;
          sPage++;
        } while (fetched < sTotal);
      }

      this.existingByPersonaMes.set(existingMap);
      this.catalogsReady.set(true);
    } catch (err: unknown) {
      this.catalogsReady.set(false);
      this.errorMessage.set(
        err instanceof Error
          ? `Carga incompleta de catálogos (${err.message}). No se habilitará la vista previa final hasta completar la consulta.`
          : 'No fue posible cargar completamente el padrón y los controles 2026.'
      );
    } finally {
      this.loadingCatalogs.set(false);
    }
  }

  async onExcelFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.errorMessage.set(null);
    this.infoMessage.set(null);

    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      this.archivoBase64.set(btoa(binary));

      const parsed = await this.conciliacionService.parseXlsxFile(file);
      const matched = parsed.filas.map((f) =>
        this.conciliacionService.matchRowAgainstPersonas(f, this.personasCatalogo())
      );
      const evaluated = this.conciliacionService.recalculateConflictsAndDuplicates(
        matched,
        this.existingByPersonaMes()
      );
      this.archivoNombre.set(file.name);
      this.archivoHash.set(parsed.archivoHash);
      this.sheetName.set(parsed.sheetName);
      this.filas.set(evaluated);
      this.infoMessage.set(
        `Archivo "${file.name}" leído en memoria (${evaluated.length} filas detectadas). Sin escrituras en base de datos.`
      );
    } catch (err: unknown) {
      this.errorMessage.set(
        err instanceof Error ? err.message : 'No fue posible leer el archivo Excel seleccionado.'
      );
    } finally {
      input.value = '';
    }
  }

  confirmarPersona(rowKey: string, persona: RhPersonaAdminDto): void {
    const updated = this.filas().map((f) => {
      if (f.rowKey !== rowKey) return f;
      return {
        ...f,
        estadoIdentidad: 'CONFIRMADA_MANUAL' as const,
        personaConfirmada: persona,
      };
    });
    this.filas.set(
      this.conciliacionService.recalculateConflictsAndDuplicates(
        updated,
        this.existingByPersonaMes()
      )
    );
    this.selectorRowKey.set(null);
    this.selectorQuery.set('');
  }

  excluirFila(rowKey: string): void {
    const updated = this.filas().map((f) => {
      if (f.rowKey !== rowKey) return f;
      return {
        ...f,
        estadoIdentidad: 'EXCLUIDA_RH' as const,
        personaConfirmada: null,
        unidadMedicaId: null,
        meses: f.meses.map((m) => ({ ...m, aprobado: false })),
      };
    });
    this.filas.set(
      this.conciliacionService.recalculateConflictsAndDuplicates(
        updated,
        this.existingByPersonaMes()
      )
    );
  }

  onUnidadFilaChange(rowKey: string, rawVal: string | number | null): void {
    const uid = rawVal !== null && rawVal !== '' ? Number(rawVal) : null;
    this.filas.set(
      this.filas().map((f) => (f.rowKey === rowKey ? { ...f, unidadMedicaId: uid } : f))
    );
  }

  toggleMesAprobado(rowKey: string, mes: number): void {
    const updated = this.filas().map((f) => {
      if (f.rowKey !== rowKey) return f;
      return {
        ...f,
        meses: f.meses.map((m) =>
          m.mes === mes && m.tipo === 'MARCA_X' ? { ...m, aprobado: !m.aprobado } : m
        ),
      };
    });
    this.filas.set(
      this.conciliacionService.recalculateConflictsAndDuplicates(
        updated,
        this.existingByPersonaMes()
      )
    );
  }

  openSelector(rowKey: string, initialQuery: string): void {
    this.selectorRowKey.set(rowKey);
    this.selectorQuery.set(initialQuery);
  }

  closeSelector(): void {
    this.selectorRowKey.set(null);
    this.selectorQuery.set('');
  }

  openConfirmImport(): void {
    const r = this.resumen();
    if (
      !this.catalogsReady() ||
      r.candidatosRecepcionHistorica <= 0 ||
      r.conflictosConBd > 0 ||
      r.duplicadosDetectados > 0
    ) {
      return;
    }
    this.confirmModalOpen.set(true);
  }

  async ejecutarImportacionAprobada(): Promise<void> {
    if (this.importing() || !this.archivoBase64()) return;
    this.importing.set(true);
    this.errorMessage.set(null);
    this.infoMessage.set(null);
    this.importResult.set(null);

    try {
      const registros = [];
      for (const f of this.filas()) {
        if (f.esVacante || f.estadoIdentidad !== 'CONFIRMADA_MANUAL' || !f.personaConfirmada) {
          continue;
        }
        for (const m of f.meses) {
          if (m.tipo === 'MARCA_X' && m.aprobado) {
            registros.push({
              persona_id: f.personaConfirmada.persona_id,
              mes: m.mes,
              unidad_medica_id: f.unidadMedicaId,
              hoja: f.sheetName,
              fila: f.rowNumber,
              columna: m.colLetter,
              nombre_excel: f.nombreOriginal,
              confirmado_por_rh: true,
            });
          }
        }
      }

      const resp = await this.rhService.importarAsistenciaHistorica2026({
        archivo_nombre: this.archivoNombre(),
        archivo_base64: this.archivoBase64(),
        archivo_hash_esperado: this.archivoHash(),
        anio: 2026,
        registros,
      });

      this.importResult.set({
        lote_id: resp.lote_id,
        idempotente: resp.idempotente,
        importados: resp.importados,
        ya_existentes: resp.ya_existentes,
        periodos_afectados: resp.periodos_afectados,
      });
      this.confirmModalOpen.set(false);
      this.infoMessage.set(
        resp.idempotente
          ? `Lote ya importado previamente (idempotente: ${resp.ya_existentes} registros existentes, sin duplicados).`
          : `Importación histórica completada: ${resp.importados} registros incorporados (lote ${resp.lote_id}).`
      );
      await this.loadReadOnlyCatalogs();
    } catch (err: unknown) {
      this.errorMessage.set(
        err instanceof Error ? err.message : 'No fue posible ejecutar la importación histórica.'
      );
      this.confirmModalOpen.set(false);
    } finally {
      this.importing.set(false);
    }
  }

  exportarJson(): void {
    if (this.filas().length === 0) return;
    const payload = this.conciliacionService.buildExportPayload(
      this.archivoNombre(),
      this.archivoHash(),
      this.filas()
    );
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conciliacion-asistencias-2026-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.infoMessage.set('Archivo JSON de conciliación exportado para resguardo temporal.');
  }

  async onImportJsonSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.errorMessage.set(null);
    this.infoMessage.set(null);

    try {
      const text = await file.text();
      const res = this.conciliacionService.applyImportedJson(
        this.filas(),
        this.archivoHash(),
        text,
        this.personasCatalogo()
      );
      const evaluated = this.conciliacionService.recalculateConflictsAndDuplicates(
        res.filas,
        this.existingByPersonaMes()
      );
      this.filas.set(evaluated);
      this.infoMessage.set(
        res.hashCoincide
          ? `Conciliación reanudada correctamente (${res.filasAplicadas} filas restauradas; huella del Excel verificada).`
          : `Conciliación restaurada (${res.filasAplicadas} filas), pero la huella del archivo Excel difiere: verifica antes de migrar.`
      );
    } catch (err: unknown) {
      this.errorMessage.set(
        err instanceof Error ? err.message : 'No fue posible cargar el archivo JSON de conciliación.'
      );
    } finally {
      input.value = '';
    }
  }
}
