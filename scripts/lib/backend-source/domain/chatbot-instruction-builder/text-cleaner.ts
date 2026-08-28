/**
 * TextCleaner — Pre-processes source text before chunking to reduce token count
 * and remove noise without losing semantic information.
 *
 * Strategies:
 * 1. Remove exact consecutive duplicates (common in chat transcriptions)
 * 2. Remove timestamps and metadata (e.g., "2024-01-01 10:30:", "[10:30]")
 * 3. Merge consecutive messages from the same sender
 * 4. Filter irrelevant short messages (< 10 words, no semantic content)
 * 5. Collapse consecutive empty lines
 *
 * Expected impact: 30-70% reduction in token count for chat transcriptions.
 */

export type TextCleanerSnapshot = Record<string, never>;

export class TextCleaner {
  private readonly irrelevantWords = new Set([
    'hola', 'hello', 'hi', 'hey', 'ok', 'okay', 'gracias', 'thanks', 'thank',
    'bye', 'adios', 'saludos', 'perfecto', 'perfect', 'genial', 'great', 'bueno',
    'nice', 'bien', 'good', 'listo', 'ready', 'dale', 'va', 'vale', 'okis', 'oki',
    'yes', 'sí', 'si', 'no', 'nope', 'nah', 'yep', 'yeah', 'ja', 'jaja', 'jajaja',
    'lol', 'haha', 'hehe', 'xd', 'hmm', 'mmm', 'umm', 'uhh', 'ok.', 'ok..', 'ok...',
    '👍', '👋', '✅', '✔️', 'okkk', 'okkkk', 'okkkkk', 'oka', 'okis', 'okii', 'okiii',
    'okkk', 'okkkk', 'okkkkk', 'okkkkkk', 'okkkkkkk', 'okkkkkkkk', 'okkkkkkkkk',
    'okkkkkkkkkk', 'okkkkkkkkkkk', 'okkkkkkkkkkkk', 'okkkkkkkkkkkkk',
    'okkkkkkkkkkkkkk', 'okkkkkkkkkkkkkkk', 'okkkkkkkkkkkkkkkk',
    'okkkkkkkkkkkkkkkkk', 'okkkkkkkkkkkkkkkkkk', 'okkkkkkkkkkkkkkkkkkk',
  ]);

  // ========== Standard DDD factories ========== //

  static createNew(): TextCleaner {
    return new TextCleaner();
  }

  static rehydrate(_snapshot: TextCleanerSnapshot): TextCleaner {
    return new TextCleaner();
  }

  toSnapshot(): TextCleanerSnapshot {
    return {};
  }

  private readonly medicalKeywords = new Set([
    'consulta', 'paciente', 'médico', 'doctor', 'doctora', 'enfermera', 'clínica',
    'hospital', 'urgencia', 'emergencia', 'cita', 'turno', 'agenda', 'agendar',
    'síntoma', 'síntomas', 'diagnóstico', 'tratamiento', 'receta', 'medicamento',
    'medicina', 'dosis', 'pastilla', 'inyección', 'análisis', 'examen', 'radiografía',
    'tomografía', 'resonancia', 'ecografía', 'laboratorio', 'resultado', 'resultados',
    'alergia', 'alérgico', 'alérgica', 'presión', 'glucosa', 'azúcar', 'colesterol',
    'fiebre', 'dolor', 'malestar', 'náusea', 'vómito', 'dolor de cabeza', 'migraña',
    'gripe', 'resfriado', 'covid', 'coronavirus', 'vacuna', 'vacunación', 'pediatría',
    'pediatra', 'ginecología', 'ginecólogo', 'ginecóloga', 'obstetra', 'cardiología',
    'cardiólogo', 'dermatología', 'dermatólogo', 'ortopedia', 'ortopedista',
    'traumatología', 'traumatólogo', 'neurología', 'neurólogo', 'oftalmología',
    'oftalmólogo', 'otorrinolaringología', 'otorrino', 'endocrinología',
    'endocrinólogo', 'oncología', 'oncólogo', 'psiquiatría', 'psiquiatra', 'psicología',
    'psicólogo', 'psicóloga', 'nutrición', 'nutricionista', 'kinesiología',
    'kinesiólogo', 'fisioterapia', 'fisioterapeuta', 'odontología', 'odontólogo',
    'dentista', 'cirugía', 'cirujano', 'anestesia', 'anestesiólogo', 'terapia',
    'rehabilitación', 'fonoaudiología', 'fonoaudiólogo', 'optometría', 'optómetra',
    'salud', 'bienestar', 'enfermedad', 'condición', 'crónico', 'crónica', 'agudo',
    'aguda', 'leve', 'grave', 'moderado', 'moderada', 'crítico', 'crítica', 'estable',
    'inestable', 'mejorando', 'empeorando', 'recuperación', 'recuperando', 'recuperado',
    'recuperada', 'alta', 'internado', 'internada', 'internación', 'quirofano',
    'quirófano', 'sala', 'pabellón', 'preoperatorio', 'postoperatorio', 'procedimiento',
    'intervención', 'análisis de sangre', 'análisis de orina', 'electrocardiograma',
    'ecg', 'eeg', 'resonancia magnética', 'rm', 'tomografía computarizada', 'tc', 'tac',
    'rx', 'mamografía', 'densitometría', 'endoscopia', 'colonoscopia', 'biopsia',
    'citología', 'papanicolau', 'papa', 'inmunización', 'refuerzo', 'esquema',
    'calendario', 'seguimiento', 'control', 'chequeo', 'chequear', 'revisión', 'revisar',
    'evaluación', 'evaluar', 'observación', 'observar', 'monitoreo', 'monitorear',
    'seguir', 'controlar', 'medication', 'medicación', 'prescripción', 'prescribir',
    'indicación', 'indicar', 'recomendación', 'recomendar', 'consejo', 'aconsejar',
    'indicaciones', 'recomendaciones', 'consejos', 'precauciones', 'precaución',
    'advertencia', 'advertir', 'alerta', 'alertar', 'riesgo', 'riesgos', 'complicación',
    'complicaciones', 'efecto secundario', 'efectos secundarios', 'reacción adversa',
    'reacciones adversas', 'contraindicación', 'contraindicaciones', 'interacción',
    'interacciones', 'alergia', 'alergias', 'hipersensibilidad', 'intolerancia',
    'sensibilidad', 'reacción', 'reacciones', 'efecto', 'efectos', 'resultado',
    'resultados', 'evolución', 'evolucionar', 'progreso', 'progresar', 'mejoría',
    'mejorar', 'mejoramiento', 'restablecimiento', 'restablecer', 'curación', 'curar',
    'sanación', 'sanar', 'rehabilitación', 'rehabilitar', 'terapia', 'terapéutico',
    'terapéutica', 'paliativo', 'paliativa', 'curativo', 'curativa', 'profiláctico',
    'profiláctica', 'preventivo', 'preventiva', 'diagnóstico', 'diagnóstica',
    'clínico', 'clínica', 'patológico', 'patológica', 'fisiológico', 'fisiológica',
    'anatómico', 'anatómica', 'histológico', 'histológica', 'bioquímico', 'bioquímica',
    'microbiológico', 'microbiológica', 'inmunológico', 'inmunológica', 'genético',
    'genética', 'molecular', 'celular', 'tissular', 'orgánico', 'orgánica', 'sistémico',
    'sistémica', 'funcional', 'estructural', 'metabólico', 'metabólica', 'endocrino',
    'endocrina', 'hormonal', 'cardiovascular', 'respiratorio', 'respiratoria',
    'digestivo', 'digestiva', 'nervioso', 'nerviosa', 'muscular', 'ósseo', 'ósea',
    'articular', 'cutáneo', 'cutánea', 'dermatológico', 'dermatológica',
    'gastrointestinal', 'hepático', 'hepática', 'renal', 'nefrólogo', 'urológico',
    'urológica', 'pulmonar', 'neumológico', 'neumológica', 'neumonía', 'bronquitis',
    'asma', 'epoc', 'enfisema', 'fibrosis', 'tuberculosis', 'influenza', 'rinitis',
    'sinusitis', 'faringitis', 'amigdalitis', 'laringitis', 'otitis', 'conjuntivitis',
    'dermatitis', 'eccema', 'psoriasis', 'acné', 'herpes', 'varicela', 'sarampión',
    'rubeola', 'paperas', 'tétanos', 'difteria', 'tos ferina', 'polio', 'hepatitis',
    'hiv', 'sida', 'sífilis', 'gonorrea', 'clamidia', 'hpv', 'vph', 'papiloma',
    'cáncer', 'tumor', 'neoplasia', 'carcinoma', 'sarcoma', 'linfoma', 'leucemia',
    'melanoma', 'metástasis', 'metastásico', 'metastásica', 'benigno', 'benigna',
    'maligno', 'maligna', 'quiste', 'pólipo', 'nódulo', 'masa', 'lesión', 'lesiones',
    'ulceración', 'úlcera', 'fístula', 'absceso', 'gangrena', 'necrosis', 'inflamación',
    'inflamatorio', 'inflamatoria', 'infección', 'infeccioso', 'infecciosa',
    'bacteriano', 'bacteriana', 'viral', 'vírica', 'fúngico', 'fúngica', 'micótico',
    'micótica', 'parásito', 'parásita', 'parasitario', 'parasitaria', 'autoinmune',
    'autoinmunidad', 'alérgico', 'alérgica', 'hipersensibilidad', 'intolerancia',
    'deficiencia', 'deficiente', 'exceso', 'excesivo', 'excesiva', 'déficit',
    'déficits', 'trastorno', 'trastornos', 'síndrome', 'síndromes', 'enfermedad',
    'enfermedades', 'patología', 'patologías', 'afección', 'afecciones', 'dolencia',
    'dolencias', 'mal', 'males', 'padecimiento', 'padecimientos', 'queja', 'quejas',
    'síntoma', 'síntomas', 'signo', 'signos', 'manifestación', 'manifestaciones',
    'hallazgo', 'hallazgos', 'anomalía', 'anomalías', 'alteración', 'alteraciones',
    'cambio', 'cambios', 'variación', 'variaciones', 'desviación', 'desviaciones',
    'anormalidad', 'anormalidades', 'irregularidad', 'irregularidades', 'problema',
    'problemas', 'complicación', 'complicaciones', 'secuela', 'secuelas', 'secundario',
    'secundaria', 'secundarios', 'secundarias', 'derivado', 'derivada', 'derivados',
    'derivadas', 'consecuencia', 'consecuencias', 'efecto', 'efectos', 'resultado',
    'resultados', 'producto', 'productos', 'repercusión', 'repercusiones', 'impacto',
    'impactos', 'influencia', 'influencias', 'implicación', 'implicaciones',
  ]);

  /**
   * Clean text by removing noise and duplicates while preserving medical information.
   * Returns cleaned text and statistics.
   */
  clean(text: string): { cleanedText: string; originalLines: number; cleanedLines: number; reductionPercent: number } {
    const originalLines = text.split('\n').length;
    
    // Step 1: Split into lines
    let lines = text.split('\n');
    
    // Step 2: Remove timestamps and metadata patterns
    lines = lines.map(line => this.removeTimestamps(line));
    
    // Step 3: Remove exact consecutive duplicates
    lines = this.removeConsecutiveDuplicates(lines);
    
    // Step 4: Merge consecutive messages from same sender
    lines = this.mergeConsecutiveMessages(lines);
    
    // Step 5: Filter irrelevant short messages
    lines = lines.filter(line => this.isRelevant(line));
    
    // Step 6: Collapse consecutive empty lines
    lines = this.collapseEmptyLines(lines);
    
    const cleanedText = lines.join('\n');
    const cleanedLines = lines.length;
    const reductionPercent = Math.round(((originalLines - cleanedLines) / originalLines) * 100);
    
    return { cleanedText, originalLines, cleanedLines, reductionPercent };
  }

  private removeTimestamps(line: string): string {
    // Remove patterns like: "2024-01-01 10:30:", "[10:30]", "10:30 AM", "10:30", etc.
    return line
      .replace(/^\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}\s*[:-]?\s*/i, '')
      .replace(/^\d{1,2}:\d{2}\s*(AM|PM|am|pm)?\s*[:-]?\s*/i, '')
      .replace(/^\[\d{1,2}:\d{2}\]\s*/i, '')
      .replace(/^\(\d{1,2}:\d{2}\)\s*/i, '')
      .replace(/^\d{1,2}\/\d{1,2}\/\d{2,4}\s*[:-]?\s*/i, '')
      .trim();
  }

  private removeConsecutiveDuplicates(lines: string[]): string[] {
    const result: string[] = [];
    let lastLine = '';
    
    for (const line of lines) {
      const normalized = line.trim().toLowerCase();
      if (normalized !== lastLine) {
        result.push(line);
        lastLine = normalized;
      }
    }
    
    return result;
  }

  private mergeConsecutiveMessages(lines: string[]): string[] {
    const result: string[] = [];
    let currentMerged = '';
    let lastSender = '';
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        if (currentMerged) {
          result.push(currentMerged);
          currentMerged = '';
          lastSender = '';
        }
        continue;
      }
      
      // Try to detect sender pattern: "Name: message" or "Name - message"
      const senderMatch = trimmed.match(/^([^:]+?):\s*(.+)$/);
      if (senderMatch) {
        const sender = senderMatch[1].trim();
        const message = senderMatch[2].trim();
        
        if (sender === lastSender && currentMerged) {
          currentMerged += ' ' + message;
        } else {
          if (currentMerged) {
            result.push(currentMerged);
          }
          currentMerged = trimmed;
          lastSender = sender;
        }
      } else {
        if (currentMerged) {
          result.push(currentMerged);
        }
        currentMerged = trimmed;
        lastSender = '';
      }
    }
    
    if (currentMerged) {
      result.push(currentMerged);
    }
    
    return result;
  }

  private isRelevant(line: string): boolean {
    const trimmed = line.trim();
    if (!trimmed) return false;
    
    // Check if line contains any medical keyword
    const lowerLine = trimmed.toLowerCase();
    const words = lowerLine.split(/\s+/);
    
    // If line has medical keywords, always keep it
    for (const word of words) {
      const cleanWord = word.replace(/[^\w]/g, '');
      if (cleanWord && this.medicalKeywords.has(cleanWord)) {
        return true;
      }
    }
    
    // If line is too short, check if it's not just an irrelevant word
    if (words.length < 10) {
      // Check if all words are irrelevant
      const allIrrelevant = words.every(word => {
        const cleanWord = word.replace(/[^\w]/g, '').toLowerCase();
        return !cleanWord || this.irrelevantWords.has(cleanWord);
      });
      return !allIrrelevant;
    }
    
    return true;
  }

  private collapseEmptyLines(lines: string[]): string[] {
    const result: string[] = [];
    let emptyCount = 0;
    
    for (const line of lines) {
      if (!line.trim()) {
        emptyCount++;
        if (emptyCount === 1) {
          result.push('');
        }
      } else {
        emptyCount = 0;
        result.push(line);
      }
    }
    
    return result;
  }
}
