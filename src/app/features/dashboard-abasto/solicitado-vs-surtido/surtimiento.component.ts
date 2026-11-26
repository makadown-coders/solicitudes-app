import { Component, WritableSignal, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Consulta, Fila, Informe, Modalidad, Ventana } from '../../../models/SurtimientoPrimerNivel';
import { SurtimientoPrimerNivelService } from '../../../services/surtimiento-primer-nivel.service';
import { agregarHojasProgramaticas } from './surtimiento-excel-programas';

@Component({standalone:true,imports:[CommonModule,FormsModule,RouterLink],templateUrl:'./surtimiento.component.html',styleUrl:'./surtimiento.component.css'})
export class SurtimientoComponent {
  private api=inject(SurtimientoPrimerNivelService);
  mes=new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',timeZone:'America/Tijuana'}).format(new Date());
  modalidad:Modalidad='MES_CALENDARIO';
  inicioMovil='';
  zona='';
  ventanas:Ventana[]=[];
  informe=signal<Informe|null>(null);
  ocupado=signal(false);
  error=signal('');
  municipio=signal(''); unidad=signal(''); clave=signal('');
  readonly registrosPorPagina=10;
  paginaConciliacion=signal(1);
  paginaSinSolicitud=signal(1);
  paginaCobertura=signal(1);
  paginaSustituciones=signal(1);
  vista=signal(false);
  pendiente=signal(false);
  private filtrar(filas: Fila[]) {
    return filas.filter(f=>(f.municipio||'').toUpperCase().includes(this.municipio().trim().toUpperCase()) &&
      (f.nombre+' '+f.clues).toUpperCase().includes(this.unidad().trim().toUpperCase()) && (f.clave||'').includes(this.clave().trim()));
  }
  pedidosFiltrados=computed(()=>this.filtrar(this.informe()?.filas??[]));
  sinPedidoFiltradas=computed(()=>this.filtrar(this.informe()?.sinSolicitud??[]));
  sustitucionesFiltradas=computed(()=>(this.informe()?.sustituciones??[]).filter(s=>(s.municipio||'').toUpperCase().includes(this.municipio().trim().toUpperCase()) &&
    (s.nombre+' '+s.clues).toUpperCase().includes(this.unidad().trim().toUpperCase()) &&
    (s.claveSolicitada+' '+s.claveSustituta).includes(this.clave().trim())));
  filtradas=computed(()=>this.vista()?this.sinPedidoFiltradas():this.pedidosFiltrados());
  unidades=computed(()=>{
    const grupos=new Map<string, {nombre:string; municipio:string; jurisdiccion:string; clues:string; solicitadas:number; evaluables:number; cubiertas:number; parciales:number; sinSalida:number; cantidad:number; cubierta:number}>();
    // El detalle ya contiene una sola fila por CLUES y clave del periodo.
    for(const f of this.pedidosFiltrados()) {
      const u=grupos.get(f.clues)??{nombre:f.nombre,municipio:f.municipio,jurisdiccion:f.jurisdiccion||'N/D',clues:f.clues,solicitadas:0,evaluables:0,cubiertas:0,parciales:0,sinSalida:0,cantidad:0,cubierta:0};
      grupos.set(f.clues,u);
      if(!f.clave || f.solicitado===null || f.solicitado<=0) continue;
      u.solicitadas++;
      if(f.tieneMovimiento===false) u.sinSalida++;
      if(f.cobertura===null) continue;
      u.evaluables++;
      u.cantidad+=f.solicitado;
      u.cubierta+=Math.min(Math.max(f.surtido,0),f.solicitado);
      if(f.surtido>=f.solicitado) u.cubiertas++;
      else if(f.surtido>0) u.parciales++;
    }
    return [...grupos.values()].map(u=>({...u,porClaves:u.evaluables?100*u.cubiertas/u.evaluables:null,
      porCantidad:u.cantidad?100*u.cubierta/u.cantidad:null}))
      .sort((a,b)=>{
        if(a.porClaves===null && b.porClaves!==null) return 1;
        if(a.porClaves!==null && b.porClaves===null) return -1;
        return (b.porClaves??0)-(a.porClaves??0)||a.nombre.localeCompare(b.nombre)||a.clues.localeCompare(b.clues);
      });
  });
  sinEvaluar=computed(()=>this.unidades().reduce((n,u)=>n+u.solicitadas-u.evaluables,0));
  resumen=computed(()=>{
    const filas=this.pedidosFiltrados();
    const comparables=filas.filter(f=>f.cobertura!==null);
    const solicitado=comparables.reduce((n,f)=>n+(f.solicitado??0),0);
    const pendiente=comparables.reduce((n,f)=>n+(f.pendiente??0),0);
    return {lineas:comparables.length,solicitado,pendiente,cobertura:solicitado?100*this.unidades().reduce((n,u)=>n+u.cubierta,0)/solicitado:null};
  });
  constructor(){this.cambiarMes();}
  totalPaginas(total:number){return Math.max(1,Math.ceil(total/this.registrosPorPagina));}
  paginas(total:number){return Array.from({length:this.totalPaginas(total)},(_,i)=>i+1);}
  paginar<T>(registros:T[],pagina:number){
    const valida=Math.min(Math.max(1,pagina),this.totalPaginas(registros.length));
    const inicio=(valida-1)*this.registrosPorPagina;
    return registros.slice(inicio,inicio+this.registrosPorPagina);
  }
  primerRegistro(total:number,pagina:number){return total?((Math.min(pagina,this.totalPaginas(total))-1)*this.registrosPorPagina)+1:0;}
  ultimoRegistro(total:number,pagina:number){return Math.min(Math.min(pagina,this.totalPaginas(total))*this.registrosPorPagina,total);}
  paginaDetalle(){return this.vista()?this.paginaSinSolicitud():this.paginaConciliacion();}
  cambiarPaginaDetalle(pagina:number){this.cambiarPagina(this.vista()?this.paginaSinSolicitud:this.paginaConciliacion,pagina,this.filtradas().length);}
  cambiarPagina(destino:WritableSignal<number>,pagina:number,total:number){
    destino.set(Math.min(Math.max(1,Number(pagina)||1),this.totalPaginas(total)));
  }
  reiniciarPaginas(){
    this.paginaConciliacion.set(1);this.paginaSinSolicitud.set(1);
    this.paginaCobertura.set(1);this.paginaSustituciones.set(1);
  }
  cambiarFiltros(){this.reiniciarPaginas();}
  cambiarMes(){
    if(this.modalidad!=='MES_CALENDARIO') return;
    const [y,m]=this.mes.split('-').map(Number);
    this.ventanas=['AZM','AZT','AZE'].map(zona=>({zona,desde:this.mes+'-01',hasta:this.mes+'-'+new Date(Date.UTC(y,m,0)).getUTCDate()}));
    this.informe.set(null);
  }
  cambiarModalidad(){
    if(this.modalidad==='MES_CALENDARIO'){this.cambiarMes();return;}
    const hasta=new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'America/Tijuana'}).format(new Date());
    const inicio=new Date(hasta+'T00:00:00Z');inicio.setUTCDate(inicio.getUTCDate()-29);
    const desde=inicio.toISOString().slice(0,10);
    this.inicioMovil=desde;
    this.ventanas=['AZM','AZT','AZE'].map(zona=>({zona,desde,hasta}));
    this.informe.set(null);this.pendiente.set(false);
  }
  editarVentana(){this.pendiente.set(true);}
  async analizar(){
    if(this.ocupado()) return;
    this.ocupado.set(true);this.error.set('');
    const consulta:Consulta={mes:this.mes,modalidad:this.modalidad,ventanas:this.ventanas.filter(v=>!this.zona||v.zona===this.zona)};
    try {
      const r=await this.api.analizar(consulta);this.informe.set(r);
      this.reiniciarPaginas();this.pendiente.set(false);
    } catch(e:any){this.error.set(e.error?.error||'No se pudo obtener el análisis. Intente de nuevo.');this.pendiente.set(true);}
    finally{this.ocupado.set(false);}
  }
  async excel(){
    const r=this.informe();if(!r||this.pendiente())return;
    const x=await import('xlsx');const libro=x.utils.book_new();
    const hoja=(nombre:string,datos:unknown[][])=>x.utils.book_append_sheet(libro,x.utils.aoa_to_sheet(datos),nombre);
    const nombreModalidad=r.modalidad==='ULTIMOS_30_DIAS'?'Ventana móvil (30 días o más)':'Mes calendario';
    const periodoMensual=r.modalidad==='MES_CALENDARIO'?this.mes:'No aplica';
    const ventanasTexto=r.ventanas.map(v=>v.zona+': '+v.desde+' a '+v.hasta).join('; ');
    hoja('Corte',[['Modalidad','Periodo mensual','Solicitudes desde','Solicitudes hasta','Corte','Zona','ID almacén','SAS desde','SAS hasta'],
      ...r.ventanas.map(v=>[nombreModalidad,periodoMensual,r.solicitudesDesde,r.solicitudesHasta,r.corte,v.zona,v.almacenId,v.desde,v.hasta])]);
    const formatoPorcentaje=(valor:number)=>{
      const centesimas=Math.round(valor*10000);
      if(centesimas%100===0) return '0%';
      return centesimas%10===0?'0.0%':'0.00%';
    };
    const porcentaje=(v:number|null)=>v===null?'N/D':v/100;
    for(const [nombre,filas] of [['Conciliación',this.pedidosFiltrados()],['Sin solicitud',this.sinPedidoFiltradas()]] as const){
      hoja(nombre,[['CLUES','Unidad','MUNICIPIO','JURISDICCIÓN','CNIS','Descripción','Solicitado acumulado','Surtido registrado SAS','Pendiente','Excedente','Cobertura %','Surtido/solicitado %','Estado','IDs de solicitudes','Trazabilidad de solicitudes','Modalidad','Solicitudes desde','Solicitudes hasta','Corte','Ventanas SAS'],...filas.map(f=>[f.clues,f.nombre,f.municipio,f.jurisdiccion||'N/D',f.clave,f.descripcion,f.solicitado,f.surtido,f.pendiente,f.excedente,porcentaje(f.cobertura),porcentaje(f.relacion),f.estado,f.solicitudIds.join(', '),f.solicitudes.map(s=>s.id+' | '+s.fecha+' | '+(s.periodo||'Sin periodo')+' | '+s.tipo).join('\n'),nombreModalidad,r.solicitudesDesde,r.solicitudesHasta,r.corte,ventanasTexto])]);
      filas.forEach((_,i)=>[10,11].forEach(c=>{
        const celda=libro.Sheets[nombre][x.utils.encode_cell({r:i+1,c})];
        if(celda?.t==='n') celda.z=formatoPorcentaje(celda.v);
      }));
    }
    hoja('Incidencias',[['Incidencia'],...r.incidencias.filter(i=>!i.startsWith('Destino por validar · ID ausente')).map(i=>[i])]);
    const sustituciones=this.sustitucionesFiltradas();
    hoja('SUSTITUCIONES_POTENCIALES',[[
      'MUNICIPIO','JURISDICCIÓN','Unidad médica','CLUES','Clave solicitada','Descripción solicitada','Pendiente directo',
      'Clave sustituta surtida','Descripción SAS','Cantidad sustituta','Factor configurado',
      'Cantidad equivalente potencial','Potencial aplicable','Relación','Ambigua','Modalidad','Solicitudes desde','Solicitudes hasta','Corte','Ventanas SAS'
    ],...sustituciones.map(s=>[
      s.municipio,s.jurisdiccion||'N/D',s.nombre,s.clues,s.claveSolicitada,s.descripcionSolicitada,s.pendienteDirecto,
      s.claveSustituta,s.descripcionSas,s.cantidadSustituta,s.factor,s.cantidadEquivalente,
      s.potencialAplicable,s.estado,s.ambigua?'Sí':'No',nombreModalidad,r.solicitudesDesde,r.solicitudesHasta,r.corte,ventanasTexto
    ])]);
    libro.Sheets['SUSTITUCIONES_POTENCIALES']['!cols']=[20,20,38,18,20,48,18,22,48,24,18,28,28,42,12].map(wch=>({wch}));
    const unidades=this.unidades();
    const encabezado=['MUNICIPIO','JURISDICCIÓN','Unidad médica','CLUES','Claves solicitadas','Evaluables','Cubiertas','Parciales','Sin salida','% claves abastecidas','Cobertura por cantidad registrada','Modalidad','Solicitudes desde','Solicitudes hasta','Corte','Ventanas SAS'];
    hoja('COBERTURA_POR_UNIDAD',[encabezado,...unidades.map(u=>[u.municipio,u.jurisdiccion,u.nombre,u.clues,u.solicitadas,u.evaluables,u.cubiertas,u.parciales,u.sinSalida,porcentaje(u.porClaves),porcentaje(u.porCantidad),nombreModalidad,r.solicitudesDesde,r.solicitudesHasta,r.corte,ventanasTexto])]);
    const metodologia='SAS refleja salidas registradas. La recepción requiere confirmación de la unidad. La cobertura por cantidad suma unidades de insumos distintos y tiene alcance operativo.';
    const destacadas=unidades.filter(u=>u.porClaves!==null).slice(0,5);
    const contexto:unknown[][]=[['Modalidad',nombreModalidad],['Periodo mensual seleccionado',periodoMensual],['Solicitudes desde',r.solicitudesDesde],['Solicitudes hasta',r.solicitudesHasta],['Fecha de corte',r.corte],['Municipio',this.municipio()||'Todos'],['Unidad',this.unidad()||'Todas'],['CNIS',this.clave()||'Todas'],['Unidades con solicitudes',unidades.length],['Metodología',metodologia],...r.ventanas.map(v=>['Ventana SAS '+v.zona,v.desde,v.hasta]),['Unidades con mayor cobertura (hasta cinco)',destacadas.map(u=>u.nombre+' ('+u.clues+')').join(', ')||'N/D']];
    hoja('RESUMEN_EJECUTIVO',[...contexto,['CLUES','Unidad médica','MUNICIPIO','JURISDICCIÓN','Claves evaluables','% claves abastecidas','Cobertura por cantidad registrada'],...unidades.map(u=>[u.clues,u.nombre,u.municipio,u.jurisdiccion,u.evaluables,porcentaje(u.porClaves),porcentaje(u.porCantidad)])]);
    for(const [nombre,inicio,columnas] of [['COBERTURA_POR_UNIDAD',1,[9,10]],['RESUMEN_EJECUTIVO',contexto.length+1,[5,6]]] as const){
      const sheet=libro.Sheets[nombre];
      unidades.forEach((_,i)=>columnas.forEach(c=>{
        const cell=sheet[x.utils.encode_cell({r:inicio+i,c})];
        if(cell?.t==='n') cell.z=formatoPorcentaje(cell.v);
      }));
      sheet['!cols']=(nombre==='COBERTURA_POR_UNIDAD'?[20,20,38,18,20,14,14,14,14,22,34]:[18,55,20,20,20,23,34]).map(wch=>({wch}));
    }
    const fechaGeneracion = new Intl.DateTimeFormat('es-MX', {
      dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Tijuana',
    }).format(new Date());
    agregarHojasProgramaticas(x, libro, r, this.pedidosFiltrados(), nombreModalidad, fechaGeneracion);
    x.writeFile(libro,'Surtimiento-Primer-Nivel-'+(r.modalidad==='ULTIMOS_30_DIAS'?'ultimos-30-dias':this.mes)+'.xlsx');
  }
}
