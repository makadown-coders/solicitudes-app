import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ArrowLeft, ContactRound, Info, LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-ti-personas-placeholder-page',
  standalone: true,
  imports: [CommonModule, RouterLink, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      id="ti-personas-placeholder"
      class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-10"
    >
      <div class="mx-auto max-w-2xl text-center py-4">
        <div
          class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#006341]/10 text-[#006341]"
          aria-hidden="true"
        >
          <lucide-icon [img]="icons.personas" class="h-6 w-6"></lucide-icon>
        </div>

        <span
          class="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-semibold text-amber-800"
        >
          <lucide-icon [img]="icons.info" class="h-3.5 w-3.5" aria-hidden="true"></lucide-icon>
          <span>Sección programada para la siguiente microintervención</span>
        </span>

        <h2 class="mt-3 text-lg font-bold text-slate-900 sm:text-xl">
          Directorio de Personas TI
        </h2>

        <div class="mx-auto my-3 w-16 border-t-2 border-[#CBA135]"></div>

        <p class="text-sm text-slate-600 leading-relaxed">
          La administración del directorio de personas (<code class="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono text-slate-800">/api/ti/personas</code>)
          y su vinculación con cuentas SSO se habilitará en una fase posterior, una vez validada la consulta administrativa de usuarios y roles.
        </p>

        <div class="mt-6">
          <a
            routerLink="/ti/usuarios"
            class="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#006341] focus:ring-offset-1"
          >
            <lucide-icon [img]="icons.arrowLeft" class="h-4 w-4" aria-hidden="true"></lucide-icon>
            <span>Volver a Usuarios SSO</span>
          </a>
        </div>
      </div>
    </div>
  `,
})
export class TiPersonasPlaceholderPageComponent {
  readonly icons = {
    personas: ContactRound,
    info: Info,
    arrowLeft: ArrowLeft,
  };
}
