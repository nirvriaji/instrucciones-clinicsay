/**
 * SystemToolDescriptions — Tool descriptions are system configuration, not
 * part of the clinic's StructuredLogic JSON.
 *
 * They are kept here so the JSON remains the single source of truth for
 * business behavior, while the phrasing of the function-calling interface is
 * centralized and versioned with the codebase.
 */

/**
 * TASKS_ONLY overrides: tools that should NOT be used for scheduling.
 */
export const TASKS_ONLY_OVERRIDES: Record<string, string> = {
  manage_schedule_block_status:
    'USAR para confirmar, cancelar o marcar en camino UNA cita especifica. ' +
    'Ejecutar esta herramienta directamente con la accion correspondiente (confirm, cancel, on_the_way). ' +
    'NO usar para agendar nuevas citas o reprogramar. ' +
    'Si el paciente quiere gestionar TODAS sus citas, usar manage_all_schedule_blocks_for_date en vez de esta.',

  manage_all_schedule_blocks_for_date:
    'USAR para confirmar, cancelar o marcar en camino TODAS las citas de un paciente en un dia especifico. ' +
    'Ejecutar esta herramienta directamente con la accion correspondiente (confirm, cancel, on_the_way). ' +
    'NO usar para agendar nuevas citas o reprogramar. ' +
    'Si el paciente quiere gestionar UNA sola cita, usar manage_schedule_block_status en vez de esta.',

  create_task:
    'USAR cuando el bot NO pueda resolver directamente con otras tools. ' +
    'Crear una tarea para que el equipo humano gestione: agendar NUEVA cita, ' +
    'buscar disponibilidad, reprogramar citas existentes, resolver profesional/tratamiento, ' +
    'o cualquier caso que las instrucciones de la clinica indiquen que va a tarea. ' +
    'Recopilar SIEMPRE: nombre, apellidos, telefono, motivo, resumen de la conversacion. ' +
    'NO usar para confirmar, cancelar ni marcar en camino citas existentes. ' +
    'NO agendar cita directamente.',

  lookup_patient:
    'USAR para buscar paciente por telefono, nombre o apellido. ' +
    'Busqueda pura: NUNCA crea pacientes. ' +
    'Retorna datos personales y citas programadas. ' +
    'La respuesta incluye isNew: true cuando no encuentra pacientes y isNew: false cuando encuentra uno o mas. ' +
    'Usar al inicio de la conversacion para ver si es paciente existente.',

  query_knowledge_base:
    'USAR para buscar informacion relevante en el manual de la clinica cuando la respuesta ' +
    'no este ya en el contexto. Busca en protocols, FAQ, responseTemplates y rules. ' +
    'NO sustituye tools de pacientes, citas o tareas.',

  query_protocol:
    'USAR para consultar el contenido completo de un protocolo por su ID. ' +
    'Devuelve el texto literal del protocolo para que puedas usarlo en la respuesta.',
};

/**
 * FULL mode enhancements: add scheduling-specific guidance.
 */
export const FULL_MODE_ENHANCEMENTS: Record<string, string> = {
  check_availability:
    'Buscar horarios disponibles para agendar una cita. ' +
    'USAR cuando el paciente pregunte por horarios, diga "quiero cita", "hay hueco", "busca disponibilidad". ' +
    'Debe llamarse DESPUES de resolve_treatment y resolve_availability_query. ' +
    'Pasa el campo isWeekdayPattern exactamente como venga de resolve_availability_query. ' +
    'El resultado incluye un campo message en español listo para usar: ya contiene todos los horarios disponibles ordenados. ' +
    'Presenta ese campo message exactamente como viene, sin resumir, omitir, reformular ni cambiar el formato de los horarios. ' +
    'Cada "hora" en el message es una hora de INICIO exacta. ' +
    'NUNCA la conviertas en un rango "entre X e Y" ni muestres la duracion como franja. ' +
    'Al reprogramar, usa el mismo professionalId de la cita original como preferencia.',

  schedule_block:
    'Crear una cita real para un paciente. ' +
    'USAR cuando el paciente elija un horario especifico. ' +
    'Debe llamarse DESPUES de resolve_patient. ' +
    'patientId debe ser el UUID real del paciente devuelto por resolve_patient. ' +
    'NUNCA usar "NEW_PATIENT" ni placeholders como patientId. ' +
    'En un flujo de reagendamiento, reutiliza exclusivamente el target cancelado persistido por el backend; ' +
    'no crees un care plan ni sesiones nuevas. Siempre confirma con el paciente antes de llamar.',

  cancel_for_rescheduling:
    'Cancelar y liberar preparatoriamente una unica cita existente para poder buscar otra fecha. ' +
    'USAR solo cuando el flujo de reagendamiento lo declare y antes de preguntar la nueva fecha. ' +
    'El backend valida el bloque y conserva el target persistido; nunca proporciones ni inventes IDs internos, metadata o modos de reserva. ' +
    'NO usar para una cancelacion definitiva: para eso usa manage_schedule_block_status.',

  manage_schedule_block_status:
    'Gestionar el estado de una cita existente: confirmar, cancelar, o marcar en camino. ' +
    'USAR cuando el paciente responda a un recordatorio o diga "cancelo mi cita". ' +
    'Solo llamar si existe una cita activa o recordatorio en el sistema.',

  create_task:
    'Crear una tarea administrativa para seguimiento humano. ' +
    'USAR cuando NO se pueda resolver directamente: agenda completa, paciente urgente, ' +
    'tratamientos que van a tarea, casos clinicos complejos, quejas, dudas de facturacion. ' +
    'Incluye SIEMPRE: nombre, apellidos, telefono, motivo, resumen.',

  resolve_patient:
    'Identificar o crear un paciente antes de agendar. ' +
    'USAR ANTES de schedule_block cuando no se conozca la identidad del paciente. ' +
    'REGLA DE ORO: Solo puedes pasar firstName, lastName o phone si el INTERLOCUTOR los dijo EXPLICITAMENTE en su mensaje actual o en mensajes anteriores de ESTA conversacion. ' +
    'NUNCA uses el nombre, apellido ni telefono que aparecen en CALLER_PHONE, ASSOCIATED_PATIENTS o en los datos del contacto de Kommo. ' +
    'Esos datos son solo de referencia; el paciente debe confirmarlos o proporcionarlos explicitamente. ' +
    'Si el paciente dice "quiero una cita" sin mencionar nombre, apellido ni telefono, deja TODOS esos campos vacios y el sistema te pedira que los preguntes. ' +
    'El numero de telefono solo puede venir de la conversacion, salvo que el paciente diga EXPLICITAMENTE "a este numero", "mi numero" o "para mi". ' +
    'En ese caso, enviar useInterlocutorPhone=true y deja phone vacio. ' +
    'Si falta alguno de estos datos, el sistema retorna status "needs_info" y pide los datos faltantes. ' +
    'El sistema busca por telefono + nombre + apellido; si no encuentra ningun paciente, lo crea automaticamente con los datos proporcionados. ' +
    'El campo isForInterlocutor solo sirve para auditoria/logging; NO altera la busqueda ni la creacion.',

  resolve_treatment:
    'Encontrar el tratamiento correcto basado en lo que dice el paciente. ' +
    'USAR cuando el paciente describe un tratamiento pero no da un ID exacto. ' +
    'Debe llamarse ANTES de check_availability.',

  resolve_professional:
    'Encontrar el profesional correcto basado en lo que dice el paciente. ' +
    'USAR cuando el paciente menciona un doctor por nombre o pide un especialista. ' +
    'Debe llamarse ANTES de check_availability si se conoce preferencia de profesional.',

  resolve_availability_query:
    'Traducir fechas en lenguaje natural a fechas concretas. ' +
    'USAR cuando el paciente expresa fechas en lenguaje natural ("proxima semana", "maniana"). ' +
    'Debe llamarse ANTES de check_availability.',

  lookup_patient:
    'Buscar paciente por numero de telefono, nombre o apellido. ' +
    'Busqueda pura: NUNCA crea pacientes. ' +
    'USAR para identificar al paciente o revisar su historial de citas. ' +
    'REGLA DE ORO: Solo busca con datos que el INTERLOCUTOR haya proporcionado EXPLICITAMENTE en esta conversacion. ' +
    'NUNCA uses CALLER_PHONE, ASSOCIATED_PATIENTS ni datos del contacto de Kommo como criterio de busqueda automatico. ' +
    'La respuesta incluye isNew: true cuando no encuentra pacientes y isNew: false cuando encuentra uno o mas. ' +
    'Usar al inicio de la conversacion para ver si es paciente existente. ' +
    'Si no hay telefono, busca por nombre+apellido. Retorna datos personales y citas programadas.',

  query_knowledge_base:
    'USAR para buscar informacion relevante en el manual de la clinica cuando la respuesta ' +
    'no este ya en el contexto. Busca en protocols, FAQ, responseTemplates y rules. ' +
    'NO sustituye tools de pacientes, citas o tareas.',

  query_protocol:
    'USAR para consultar el contenido completo de un protocolo por su ID. ' +
    'Devuelve el texto literal del protocolo para que puedas usarlo en la respuesta.',
};
