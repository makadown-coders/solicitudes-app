export const EXCEL_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const ensureExcelExtension = (nombreArchivo: string): string =>
    nombreArchivo.endsWith('.xlsx') ? nombreArchivo : `${nombreArchivo}.xlsx`;

export const descargarArchivo = (buffer: ArrayBuffer, nombreArchivo: string) => {
    const blob = new Blob([buffer], { type: EXCEL_MIME });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = ensureExcelExtension(nombreArchivo);
    a.click();
    window.URL.revokeObjectURL(url);
};

export const convertirBufferABase64 = async (buffer: ArrayBuffer): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onloadend = () => {
            const result = reader.result as string;
            if (result && result.includes('base64,')) {
                resolve(result.split('base64,')[1]);
            } else {
                resolve(result ?? '');
            }
        };

        reader.onerror = () => reject(new Error('Error al leer el buffer'));

        const blob = new Blob([buffer], { type: EXCEL_MIME });
        reader.readAsDataURL(blob);
    });
};

export const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
    const binaryString = atob(base64);
    const length = binaryString.length;
    const bytes = new Uint8Array(length);

    for (let i = 0; i < length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    return bytes.buffer;
};

export const formatearFecha = (fecha: string | Date | null): string => {
    if (!fecha) return '';
    const date = new Date(fecha);
    return isNaN(date.getTime())
        ? ''
        : `${date.getDate().toString().padStart(2, '0')}/` +
          `${(date.getMonth() + 1).toString().padStart(2, '0')}/` +
          `${date.getFullYear()}`;
};
