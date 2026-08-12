/**
 * DefaultStructuredLogic — Default chatbot configuration as pure JSON.
 *
 * The exported function builds a complete, valid StructuredLogic object
 * for either 'full' or 'tasks-only' mode. It is the single source of truth
 * for default chatbot behavior.
 */

import {
  BASELINE_INTENTS,
  type BusinessRule,
  type ClinicCapabilities,
  type ConversationResumptionConfig,
  type ErrorCategory,
  type FaqEntry,
  type IntentCatalog,
  type Protocol,
  type ResponseTemplates,
  type ServiceCatalog,
  type StructuredLogic,
  type StyleRules,
  type SystemPromptInstructions,
  type ToolFlow,
  type TreatmentPolicyHint,
} from './structured-logic';

function buildDefaultIdentity(mode: 'full' | 'tasks-only'): NonNullable<StructuredLogic['identity']> {
  return {
    botName: '{{NOMBRE_BOT}}',
    clinicName: '{{CLINIC_NAME}}',
    address: '{{DIRECCION}}',
    phone: '{{TELEFONO}}',
    email: '{{EMAIL}}',
    website: '{{WEB}}',
    openingHours: '{{HORARIO}}',
    language: 'auto',
    persona: 'asistente virtual de la clinica',
    tone: 'muy cariñoso, cercano, amable, profesional y claro',
    farewellMessage:
      'Gracias por contactar con {{CLINIC_NAME}}. Si necesitas algo mas, estamos aqui.',
    escalationMessage:
      'Para orientarte bien, prefiero que lo revise nuestro equipo especializado. Les paso tu caso ahora mismo y te contactan.',
  };
}

function buildDefaultStyleRules(mode: 'full' | 'tasks-only'): NonNullable<StructuredLogic['styleRules']> {
  const common: StyleRules = {
    brevity: '1-2 frases cortas',
    format: 'texto plano, sin markdown, sin asteriscos, sin negritas, sin listas',
    tone: 'muy cariñoso, cercano, amable, profesional y claro',
    languagePolicy: 'auto',
    noMedicalDiagnosis: true,
    noAsterisks: true,
    noMarkdown: true,
    maxSentences: 2,
    maxWordsPerSentence: 18,
    avoidPhrases: [
      'Vaya, lamento que...',
      'Debe ser muy molesto',
      'Siento muchisimo que te sientas asi',
    ],
    mandatoryPhrases: [
      'Para orientarte bien, prefiero que lo revise nuestro equipo especializado.',
    ],
    additionalRules: [
      'No pensar en voz alta.',
      'Una unica pregunta por turno.',
      'No terminar con pregunta salvo que sea imprescindible.',
      'NUNCA dar ejemplos de frases como "puedes decir mañana, el lunes, etc.". Eso genera referencias ambiguas que confunden al time-resolver.',
      'Si el paciente ya menciono una fecha ambigua (ej. "el lunes"), NO pedirle manualmente que aclare si es hoy o la semana que viene. Usar la fecha que el mismo paciente propuso.',
      'Si el paciente ya menciono un tratamiento o sintoma, NO pedirle manualmente "que tratamiento necesitas". Usar lo que ya dijo.',
      'Si el paciente ya propuso un horario (ej. "a las 4"), NO pedirle manualmente "que horario prefieres". Usar la fecha/hora que propuso.',
      'REGLA DE ORO (resolve_patient): Solo puedes pasar nombre, apellido o telefono a resolve_patient si el INTERLOCUTOR los dijo EXPLICITAMENTE en esta conversacion. NUNCA uses CALLER_PHONE, ASSOCIATED_PATIENTS ni los datos del contacto de Kommo como si fueran confirmados por el paciente. Si el paciente dice "quiero una cita" sin datos, deja los campos vacios y el sistema te pedira que los preguntes.',
    ],
    mustOfferHumanHandoff: true,
    timeGreetingRanges: [
      { label: 'dias', start: '06:00', end: '13:59', greeting: 'buenos días' },
      { label: 'tardes', start: '14:00', end: '21:00', greeting: 'buenas tardes' },
      { label: 'noches', start: '21:01', end: '05:59', greeting: 'buenas noches' },
    ],
  };

  if (mode === 'tasks-only') {
    return {
      ...common,
      emojiPolicy: 'forbidden',
    };
  }

  return {
    ...common,
    emojiPolicy: 'allowed',
  };
}

function buildDefaultResponseTemplates(mode: 'full' | 'tasks-only'): ResponseTemplates {
  const templates: ResponseTemplates = {
    appointment_confirmed: { text: 'Perfecto, he registrado su confirmación. ¡Nos vemos pronto!', mode: 'literal' },
    appointment_cancelled: { text: 'Entendido, hemos gestionado tu cita.', mode: 'literal' },
    task_created: { text: 'Te contactaremos por WhatsApp lo antes posible.', mode: 'literal' },
    list_wait: { text: 'Te contactaremos por WhatsApp lo antes posible. Quedas en lista de espera.', mode: 'literal' },
    no_availability: { text: 'Te contactaremos por WhatsApp lo antes posible. Quedas en lista de espera.', mode: 'literal' },
    on_the_way: { text: 'No te preocupes, ven con cuidado. Aprovecharemos el tiempo lo mejor posible.', mode: 'literal' },
    sensitive_situation: {
      text: 'Para orientarte bien, prefiero que lo revise nuestro equipo especializado. Les paso tu caso ahora mismo y te contactan.',
      mode: 'literal',
    },
    emotional_support: {
      text: 'Gracias por contarmelo. Voy a pasarlo al equipo para que puedan acompanarte y revisarlo con cuidado.',
      mode: 'literal',
    },
    greeting: { text: 'Hola, soy {{NOMBRE_BOT}}, el asistente virtual de {{CLINIC_NAME}}. ¿En que puedo ayudarte?', mode: 'literal' },
    goodbye: { text: 'Gracias por contactar con {{CLINIC_NAME}}. Si necesitas algo mas, estamos aqui.', mode: 'literal' },
    information_not_available: { text: 'No tengo información sobre eso en este momento. ¿Quieres que lo consulte con el equipo?', mode: 'literal' },
    out_of_scope: { text: 'Soy el asistente de {{CLINIC_NAME}} y solo puedo ayudarte con nuestros servicios, tratamientos y citas. ¿En qué puedo ayudarte?', mode: 'literal' },
    farewell: { text: 'Gracias por contactar con {{CLINIC_NAME}}. Si necesitas algo más, estamos aquí.', mode: 'literal' },
    home_visit: { text: 'Claro, las visitas a domicilio las gestiona directamente el equipo. ¿Quieres que deje la solicitud anotada?', mode: 'literal' },
    class_issue: { text: 'Entendido. Voy a pasar tu caso al equipo para que lo revisen y te contacten.', mode: 'literal' },
    change_requested: { text: 'He pasado tu solicitud al equipo. Te contactarán pronto.', mode: 'literal' },
    acknowledgement: { text: 'Gracias a ti. Si necesitas algo mas, estamos aqui.', mode: 'literal' },
    cancellation_inquiry: { text: '¿Quieres que cancelemos la cita o prefieres buscar otra fecha?', mode: 'literal' },
    keep_appointment: { text: 'Perfecto, tu cita sigue confirmada.', mode: 'literal' },
    reschedule_inquiry: { text: '¿Quieres que confirmemos el cambio de tu cita o prefieres que lo gestione el equipo?', mode: 'literal' },
  };

  if (mode === 'full') {
    return {
      ...templates,
      appointment_booked: { text: 'He agendado su cita. ¿Necesita algo mas?', mode: 'literal' },
      appointment_multiple: {
        text: 'He agendado tus citas. Si necesitas cambiar alguna, dimelo.',
        mode: 'literal',
      },
      reschedule_inquiry_full: {
        text: 'Sí, podemos gestionar el cambio de tu cita. ¿Quieres que confirmemos el reagendamiento?',
        mode: 'literal',
      },
    };
  }

  return templates;
}

function buildDefaultFaq(mode: 'full' | 'tasks-only'): FaqEntry[] {
  const common: FaqEntry[] = [
    {
      question: '¿Donde esta la clinica?',
      answer: 'Estamos en {{DIRECCION}}. ¿Necesitas ayuda para llegar?',
    },
    {
      question: '¿Haceis domicilio?',
      answer: 'Claro. Las visitas a domicilio las revisa directamente el equipo. ¿Te gustaria que dejemos la solicitud anotada?',
    },
    {
      question: '¿Aceptais pago con tarjeta?',
      answer: 'Si, aceptamos efectivo y tarjeta. Tambien puedes pagar con Bizum al {{TELEFONO}}.',
    },
    {
      question: '¿Teneis bonos?',
      answer: 'Para informarte del precio y las condiciones, voy a pasar tu consulta al equipo.',
    },
    {
      question: '¿Que puede ser este dolor o que ejercicios deberia hacer?',
      answer: 'Para orientarte bien, prefiero que lo revise nuestro equipo especializado. Les paso tu caso ahora mismo y te contactan.',
    },
    {
      question: '¿Puedo cambiar mi cita?',
      answer: 'Gracias por avisarnos con antelacion. Voy a gestionar el cambio de tu cita.',
    },
    {
      question: '¿Cual es el telefono?',
      answer: 'Nuestro telefono es {{TELEFONO}}. ¿En que puedo ayudarte?',
    },
    {
      question: '¿Cual es el horario?',
      answer: 'Nuestro horario es {{HORARIO}}. ¿Necesitas una cita?',
    },
    {
      question: '¿Teneis pagina web?',
      answer: 'Si, puedes visitarnos en {{WEB}}. ¿Necesitas ayuda con algo mas?',
    },
  ];

  if (mode === 'full') {
    return common;
  }

  // tasks-only: remove emojis from FAQ answers
  return common.map((entry) => ({
    ...entry,
    answer: entry.answer.trim(),
  }));
}

function buildDefaultCapabilities(mode: 'full' | 'tasks-only'): ClinicCapabilities {
  // sensitiveSituations and protocols are opt-in capabilities in the JSON.
  return {
    sensitiveSituations: false,
    protocols: false,
  };
}

function buildDefaultIntents(mode: 'full' | 'tasks-only'): IntentCatalog {
  return {
    ...BASELINE_INTENTS,
  };
}

function buildDefaultFlows(mode: 'full' | 'tasks-only'): Record<string, ToolFlow> {
  if (mode === 'full') {
    return {
      new_appointment_scheduling: {
        intent: 'new_appointment_scheduling',
        description:
          'Agendar una cita NUEVA para el interlocutor, un familiar o un tercero. ' +
          'El bot SIEMPRE resuelve al paciente (nombre, apellido y telefono) durante la conversacion antes de agendar.',
        selection: {
          // Prevent confusion with rescheduling: a patient with an active appointment
          // should be handled by existing_appointment_rescheduling when they want to move it,
          // or by this flow only when they want an additional/new appointment.
          excludedCapabilities: ['hasActiveAppointment'],
        },
        steps: [
          {
            step: 1,
            tools: ['resolve_treatment', 'resolve_availability_query'],
            parallel: true,
            note: 'Identificar tratamiento y traducir fechas. NO pedir datos del paciente todavia.',
          },
          {
            step: 2,
            tools: ['resolve_patient'],
            parallel: false,
            note:
              'Pedir y usar SIEMPRE nombre, apellido y telefono de la conversacion. ' +
              'NO asumir datos de Kommo. Buscar paciente; si no existe, crear automaticamente.',
          },
          {
            step: 3,
            tools: ['check_availability'],
            parallel: false,
            required: ['hasResolvedTreatment'],
            note: 'Buscar horarios con treatmentId + fechas resueltas (condicion: treatment_resolved).',
          },
          {
            step: 4,
            tools: ['schedule_block'],
            parallel: false,
            required: ['hasResolvedPatient'],
            note:
              'Agendar SOLO con patientId real obtenido de resolve_patient. ' +
              'NUNCA usar patientId: "NEW_PATIENT".',
          },
        ],
      },
      confirm_appointment: {
        intent: 'existing_appointment_confirmation',
        description: 'Paciente confirma asistencia a una cita ya reservada, especialmente como respuesta a un recordatorio.',
        selection: {
          // Deterministic gate: this flow is only eligible when a real
          // appointment exists (future block or reminder link). Without it,
          // a bare "sí" can never produce a fake confirmation.
          requiredCapabilities: ['hasActiveAppointment'],
        },
        steps: [
          {
            step: 1,
            tools: ['manage_schedule_block_status'],
            parallel: false,
            note: 'Marcar CONFIRMADA',
          },
        ],
        // Modo `model`: una confirmacion sin fecha no confirma nada. El paciente
        // debe poder comprobar QUE cita ha quedado confirmada.
        responseTemplate: 'Perfecto, tu cita del {fecha} a las {hora} queda confirmada. Nos vemos pronto.',
        responseTemplateMode: 'model',
      },
      cancel_appointment: {
        intent: 'existing_appointment_cancellation',
        selection: {
          // Deterministic gate: only eligible when a real appointment exists
          // (future non-cancelled block or reminder link). Without it, a bare
          // "sí" can never produce a fake action on a non-existent appointment.
          requiredCapabilities: ['hasActiveAppointment'],
        },
        description: 'Paciente comunica que no podra asistir a una cita ya reservada y necesita anularla.',
        steps: [
          {
            step: 1,
            tools: ['manage_schedule_block_status'],
            parallel: false,
            note:
              'Marcar CANCELADA. El campo "reason" es obligatorio; usar "Solicitud del paciente". NO preguntar motivo al paciente. ' +
              'Si quiere otra cita, ofrecer el flujo separado de new_appointment_scheduling despues de cancelar; no agendar ni crear una tarea desde este flujo.',
          },
        ],
        allowedTools: ['manage_schedule_block_status'],
        // Modo `model`: cancelar sin decir QUE cita se cancela deja al paciente
        // sin forma de detectar que se ha cancelado la equivocada.
        responseTemplate:
          'Entendido, hemos cancelado tu cita del {fecha} a las {hora}. Si necesitas otra, avisanos.',
        responseTemplateMode: 'model',
      },
      reschedule_appointment: {
        intent: 'existing_appointment_rescheduling',
        selection: {
          // Deterministic gate: only eligible when a real appointment exists
          // (future non-cancelled block or reminder link). Without it, a bare
          // "sí" can never produce a fake action on a non-existent appointment.
          requiredCapabilities: ['hasActiveAppointment'],
        },
        description:
          'Paciente quiere cambiar la fecha u hora de una cita YA AGENDADA. ' +
          'Incluye: (a) mover a otro dia, (b) adelantar/atrasar el MISMO dia, ' +
          '(c) corregir titular manteniendo mismo tratamiento, (d) restablecer cita tras cancelar en este turno.',
        // El target de reagendamiento se captura antes de pedir la nueva fecha.
        // Sus IDs de care plan/sesiones los devuelve scheduling, nunca el LLM.
        steps: [
          {
            step: 1,
            tools: ['cancel_for_rescheduling'],
            parallel: false,
            note:
              'Cancelar y liberar preparatoriamente la cita elegible. El backend conserva el target y sus sesiones; ' +
              'no inventar carePlanId ni plannedSessionIds.',
          },
          {
            step: 2,
            tools: ['resolve_availability_query'],
            parallel: false,
            required: ['hasCancelledRescheduleTarget'],
            note: 'Resolver las nuevas fechas que pide el paciente despues de capturar el target.',
          },
          {
            step: 3,
            tools: ['check_availability'],
            parallel: false,
            required: ['hasCancelledRescheduleTarget', 'hasResolvedAvailabilityQuery'],
            note: 'Buscar nuevos horarios (condicion: dates_resolved). Mantener mismo professionalId de la cita original como preferencia. Para mismo dia: filtrar slots del dia actual.',
          },
          {
            step: 4,
            tools: ['schedule_block'],
            parallel: false,
            required: ['hasCancelledRescheduleTarget', 'hasShownSlots'],
            note:
              'Agendar la NUEVA cita (condicion: slot_selected) reutilizando el target persistido CARE_PLAN. ' +
              'El backend toma carePlanId y plannedSessionIds del target cancelado.',
          },
        ],
        allowedTools: [
          'cancel_for_rescheduling',
          'resolve_availability_query',
          'check_availability',
          'schedule_block',
        ],
        // LA plantilla del incidente. En `literal` el modelo tenia PROHIBIDO
        // anadir la fecha, asi que el paciente recibio "He movido tu cita. Te
        // esperamos en la nueva fecha y hora." y no pudo detectar que le habian
        // agendado el dia equivocado. {fecha} y {hora} las rellena el servidor
        // con los datos reales de la operacion antes de que el modelo las vea.
        responseTemplate: 'He movido tu cita al {fecha} a las {hora}. Te esperamos.',
        responseTemplateMode: 'model',
      },
      on_the_way: {
        intent: 'existing_appointment_delay_notice',
        selection: {
          // Deterministic gate: only eligible when a real appointment exists
          // (future non-cancelled block or reminder link). Without it, a bare
          // "sí" can never produce a fake action on a non-existent appointment.
          requiredCapabilities: ['hasActiveAppointment'],
        },
        description: 'Paciente avisa que llega tarde a una cita confirmada.',
        steps: [
          {
            step: 1,
            tools: ['manage_schedule_block_status'],
            parallel: false,
            note: 'Marcar EN_CAMINO',
          },
        ],
        // Modo `model`: el paciente avisa de un retraso sobre una cita concreta;
        // nombrarla es como comprueba que hemos ajustado la correcta.
        responseTemplate: 'Gracias por avisar. Ajustamos tu cita del {fecha} a las {hora} segun el retraso.',
        responseTemplateMode: 'model',
      },
      reschedule_inquiry: {
        intent: 'existing_appointment_reschedule_inquiry',
        description: 'Paciente pregunta sobre reagendar o cambiar una cita, sin decidir aun.',
        steps: [],
        responseTemplate: 'reschedule_inquiry_full',
        responseTemplateMode: 'literal',
      },
      cancellation_inquiry: {
        intent: 'existing_appointment_cancellation_inquiry',
        description: 'Paciente pregunta sobre cancelar una cita, sin decidir aun.',
        steps: [],
        responseTemplate: 'cancellation_inquiry',
        responseTemplateMode: 'literal',
      },
      keep_appointment_flow: {
        intent: 'existing_appointment_keep',
        selection: {
          // Deterministic gate: only eligible when a real appointment exists
          // (future non-cancelled block or reminder link). Without it, a bare
          // "sí" can never produce a fake action on a non-existent appointment.
          requiredCapabilities: ['hasActiveAppointment'],
        },
        description: 'Paciente indica que quiere mantener la cita tal como esta.',
        steps: [],
        responseTemplate: 'keep_appointment',
        responseTemplateMode: 'literal',
      },
      farewell: {
        intent: 'farewell',
        description: 'Paciente se despide, agradece o cierra la conversación de forma amable.',
        steps: [{ step: 1, tools: [], parallel: false }],
        responseTemplate: 'Gracias por contactar con {{CLINIC_NAME}}. Si necesitas algo más, estamos aquí.',
        responseTemplateMode: 'literal',
        allowsSilence: true,
      },
    };
  }

  return {
    any_scheduling_request: {
      intent: 'new_appointment_scheduling',
      description: 'El interlocutor quiere reservar una NUEVA sesion. En modo tasks-only, se crea tarea para seguimiento humano.',
      steps: [
        {
          step: 1,
          tools: ['create_task'],
          parallel: false,
          required: [],
          note: 'Crear tarea para seguimiento humano',
        },
      ],
      responseTemplate: 'Te contactaremos por WhatsApp lo antes posible.',
      responseTemplateMode: 'literal',
    },
    confirm_existing_appointment: {
      intent: 'existing_appointment_confirmation',
      selection: {
        // Deterministic gate: only eligible when a real appointment exists
        // (future non-cancelled block or reminder link). Without it, a bare
        // "sí" can never produce a fake confirmation.
        requiredCapabilities: ['hasActiveAppointment'],
      },
      description: 'Paciente confirma asistencia a una cita ya reservada, especialmente como respuesta a un recordatorio.',
      steps: [
        {
          step: 1,
          tools: ['manage_schedule_block_status'],
          parallel: false,
          required: [],
          note: 'Marcar CONFIRMADA',
        },
      ],
      responseTemplate: 'appointment_confirmed',
    },
    cancel_existing_appointment: {
      intent: 'existing_appointment_cancellation',
      selection: {
        // Deterministic gate: only eligible when a real appointment exists
        // (future non-cancelled block or reminder link). Without it, a bare
        // "sí" can never produce a fake action on a non-existent appointment.
        requiredCapabilities: ['hasActiveAppointment'],
      },
      description: 'Paciente comunica que no podra asistir a una cita ya reservada y necesita anularla.',
      steps: [
        {
          step: 1,
          tools: ['manage_schedule_block_status'],
          parallel: false,
          required: [],
          note: 'Marcar CANCELADA. El campo "reason" es obligatorio; usar "Solicitud del paciente". NO preguntar motivo al paciente.',
        },
      ],
      responseTemplate: 'appointment_cancelled',
    },
    mark_on_the_way: {
      intent: 'existing_appointment_delay_notice',
      selection: {
        // Deterministic gate: only eligible when a real appointment exists
        // (future non-cancelled block or reminder link). Without it, a bare
        // "sí" can never produce a fake action on a non-existent appointment.
        requiredCapabilities: ['hasActiveAppointment'],
      },
      description: 'Paciente avisa que llega tarde a una cita confirmada.',
      steps: [
        {
          step: 1,
          tools: ['manage_schedule_block_status'],
          parallel: false,
          required: [],
          note: 'Marcar EN_CAMINO',
        },
      ],
      responseTemplate: 'on_the_way',
    },
    reschedule_existing_appointment: {
      intent: 'existing_appointment_rescheduling',
      selection: {
        // Deterministic gate: only eligible when a real appointment exists
        // (future non-cancelled block or reminder link). Without it, a bare
        // "sí" can never produce a fake action on a non-existent appointment.
        requiredCapabilities: ['hasActiveAppointment'],
      },
      description:
        'Paciente quiere cambiar la fecha u hora de una cita YA AGENDADA. ' +
        'En modo tasks-only, el flujo por defecto es: cancelar cita actual + crear tarea de seguimiento. ' +
        'Las clinicas pueden simplificar a solo create_task si no quieren cancelar automaticamente.',
      steps: [
        {
          step: 1,
          tools: ['manage_schedule_block_status', 'create_task'],
          parallel: true,
          required: [],
          note:
            'Cancelar cita actual (reason="Solicitud del paciente", NO preguntar motivo) + crear tarea para seguimiento humano. ' +
            'Para correccion de titular: cancelar cita actual, crear tarea indicando paciente correcto y mismo treatmentId. ' +
            'Para restablecer tras cancelacion en este turno: usar datos del historial de tool outputs.',
        },
      ],
      responseTemplate: 'change_requested',
    },
    reschedule_inquiry: {
      intent: 'existing_appointment_reschedule_inquiry',
      description: 'Paciente pregunta sobre reagendar o cambiar una cita, sin decidir aun.',
      steps: [],
      responseTemplate: '¿Quieres que confirmemos el cambio de tu cita o prefieres otra fecha?',
      responseTemplateMode: 'literal',
    },
    cancellation_inquiry: {
      intent: 'existing_appointment_cancellation_inquiry',
      description: 'Paciente pregunta sobre cancelar una cita, sin decidir aun.',
      steps: [],
      responseTemplate: '¿Quieres que cancelemos la cita o prefieres buscar otra fecha?',
      responseTemplateMode: 'literal',
    },
    keep_appointment_flow: {
      intent: 'existing_appointment_keep',
      selection: {
        // Deterministic gate: only eligible when a real appointment exists
        // (future non-cancelled block or reminder link). Without it, a bare
        // "sí" can never produce a fake action on a non-existent appointment.
        requiredCapabilities: ['hasActiveAppointment'],
      },
      description: 'Paciente indica que quiere mantener la cita tal como esta.',
      steps: [],
      responseTemplate: 'Perfecto, tu cita sigue confirmada.',
      responseTemplateMode: 'literal',
    },
    farewell: {
      intent: 'farewell',
      description: 'Paciente se despide, agradece o cierra la conversación de forma amable.',
      steps: [{ step: 1, tools: [], parallel: false }],
      responseTemplate: 'Gracias por contactar con {{CLINIC_NAME}}. Si necesitas algo más, estamos aquí.',
      responseTemplateMode: 'literal',
      allowsSilence: true,
    },
  };
}

function buildDefaultRules(mode: 'full' | 'tasks-only'): BusinessRule[] {
  const common: BusinessRule[] = [
    {
      id: 'ask_about_existing_appointment',
      intent: 'existing_appointment_inquiry',
      description: 'El paciente consulta informacion sobre citas que ya tiene reservadas, como horarios, fechas o tratamientos.',
      action: 'allow',
      note: 'El backend inyecta las citas del paciente en el system prompt. El bot responde sin llamar tools.',
    },
    {
      id: 'confirm_existing_appointment',
      intent: 'existing_appointment_confirmation',
      description: 'El paciente confirma asistencia a una cita existente con un afirmativo breve o respondiendo a un recordatorio.',
      action: 'allow',
      note: 'Ejecutar manage_schedule_block_status (CONFIRMADA).',
    },
    {
      id: 'cancel_existing_appointment',
      intent: 'existing_appointment_cancellation',
      description: 'El paciente cancela una cita existente o indica que no podra asistir.',
      action: 'allow',
      note: 'Ejecutar el flow de cancelacion.',
    },
    {
      id: 'general_inquiry',
      intent: 'general_inquiry',
      description: 'El paciente pregunta por tratamientos, precios fijos, medicos, contacto, horarios o servicios.',
      action: 'allow',
      note: 'Responder directamente con la informacion del contexto y las instrucciones.',
    },
    {
      id: 'human_follow_up',
      intent: 'human_follow_up',
      description: 'Solicitudes que requieren seguimiento humano y no encajan en los intents anteriores.',
      action: 'allow',
      note: 'Crear tarea para seguimiento humano.',
    },
    {
      id: 'farewell',
      intent: 'farewell',
      description: 'El paciente se despide, agradece o cierra la conversación de forma amable.',
      action: 'allow',
      note: 'Permitir al bot responder brevemente o callarse amablemente.',
    },
  ];

  if (mode === 'full') {
    return [
      ...common,
      {
        id: 'reschedule_inquiry',
        intent: 'existing_appointment_reschedule_inquiry',
        description: 'Paciente pregunta sobre reagendar o cambiar una cita, sin decidir aun.',
        action: 'allow',
        note: 'Responder conversacionalmente. En full, el bot puede buscar disponibilidad si el paciente confirma.',
      },
      {
        id: 'cancellation_inquiry',
        intent: 'existing_appointment_cancellation_inquiry',
        description: 'Paciente pregunta sobre cancelar una cita, sin decidir aun.',
        action: 'allow',
        note: 'Responder conversacionalmente. Preguntar si quiere cancelar o buscar otra fecha.',
      },
      {
        id: 'keep_appointment',
        intent: 'existing_appointment_keep',
        description: 'Paciente indica que quiere mantener la cita tal como esta.',
        action: 'allow',
        informOnly: true,
        note: 'Confirmar que la cita sigue activa.',
      },
      {
        id: 'scheduling_request',
        intent: 'new_appointment_scheduling',
        description:
          'El paciente (o alguien en su nombre) quiere reservar una NUEVA cita. ' +
          'Tambien incluye "restablecer" una cita cancelada en este mismo turno de conversacion.',
        action: 'allow',
        note:
          'El bot SIEMPRE resuelve al paciente (nombre, apellido y telefono) durante la conversacion antes de agendar. ' +
          'Para restablecer: usar datos del historial de tool outputs.',
      },
      {
        id: 'reschedule_request',
        intent: 'existing_appointment_rescheduling',
        description:
          'El paciente quiere MOVER una cita ya agendada a otra fecha u hora. ' +
          'Incluye: otro dia, mismo dia (adelantar/atrasar), correccion de titular, restablecer tras cancelacion en este turno.',
        action: 'allow',
        note:
          'Cancelar cita actual (reason="Solicitud del paciente", NO preguntar motivo) + agendar nueva. ' +
          'Para correccion de titular: mantener mismo treatmentId. ' +
          'Para restablecer: usar datos del historial de tool outputs de este turno.',
      },
      {
        id: 'patient_running_late',
        intent: 'existing_appointment_delay_notice',
        description: 'El paciente avisa que llegara tarde a una cita confirmada.',
        action: 'allow',
        note: 'Marcar EN_CAMINO.',
      },
    ];
  }

  return [
    ...common,
    {
      id: 'all_scheduling_to_task',
      intent: 'new_appointment_scheduling',
      description: 'El paciente (o alguien en su nombre) quiere agendar cita o consultar disponibilidad.',
      action: 'allow',
      note: 'En modo tasks-only, el flow any_scheduling_request crea tarea para seguimiento humano.',
      redirectToTask: true,
    },
    {
      id: 'all_reschedule_to_task',
      intent: 'existing_appointment_rescheduling',
      description:
        'El paciente quiere MOVER una cita ya agendada a otra fecha u hora. ' +
        'Incluye adelantar/atrasar mismo dia, correccion de titular y restablecer tras cancelacion en este turno.',
      action: 'allow',
      note:
        'En modo tasks-only, el flujo por defecto cancela la cita actual y crea tarea de seguimiento. ' +
        'Las clinicas pueden simplificar a solo create_task si no quieren cancelar automaticamente. ' +
        'NO preguntar motivo al paciente; usar reason="Solicitud del paciente".',
      redirectToTask: true,
    },
    {
      id: 'all_cancellations_to_task',
      intent: 'existing_appointment_cancellation',
      description: 'El paciente cancela cita o no asistira.',
      action: 'allow',
      note:
        'El bot puede cancelar citas existentes directamente en modo tasks-only. ' +
        'NO preguntar el motivo al paciente. El campo reason es obligatorio; usar "Solicitud del paciente".',
    },
    {
      id: 'reschedule_inquiry',
      intent: 'existing_appointment_reschedule_inquiry',
      description: 'Paciente pregunta sobre reagendar o cambiar una cita, sin decidir aun.',
      action: 'allow',
      note: 'Consulta sobre reprogramacion. El bot pregunta si quiere confirmar el cambio.',
    },
    {
      id: 'cancellation_inquiry',
      intent: 'existing_appointment_cancellation_inquiry',
      description: 'Paciente pregunta sobre cancelar una cita, sin decidir aun.',
      action: 'allow',
      note: 'Consulta sobre cancelacion. El bot pregunta si quiere cancelar o buscar otra fecha.',
    },
    {
      id: 'keep_appointment',
      intent: 'existing_appointment_keep',
      description: 'Paciente indica que quiere mantener la cita tal como esta.',
      action: 'allow',
      note: 'Paciente quiere mantener la cita. El bot confirma que sigue activa.',
    },
  ];
}

function buildDefaultErrorCategories(mode: 'full' | 'tasks-only'): ErrorCategory[] {
  const common: ErrorCategory[] = [
    {
      id: 'session_not_found',
      description: 'La cita o sesion no existe',
      suggestions: [
        'Verificar que el ID de la sesion sea correcto',
        'La sesion puede haber sido eliminada',
      ],
    },
    {
      id: 'permission_denied',
      description: 'El usuario no tiene permisos para realizar la accion',
      suggestions: [
        'El usuario bot puede no tener permiso para esta accion',
        'Contactar al staff de la clinica para asistencia',
      ],
    },
    {
      id: 'task_status_group_not_found',
      description: 'El grupo de estados de tarea no existe',
      suggestions: [
        'El sitio puede no tener un grupo de estados de tarea configurado',
        'Contactar al staff de la clinica para configurar tableros de tareas',
      ],
    },
  ];

  if (mode === 'full') {
    return [
      ...common,
      {
        id: 'scheduling_conflict',
        description: 'El horario o slot ya esta ocupado o hay conflicto de disponibilidad',
        suggestions: [
          'Probar con un horario diferente',
          'Verificar disponibilidad con check_availability',
        ],
      },
      {
        id: 'resource_not_found',
        description: 'El profesional, sala o recurso no existe en el sistema',
        suggestions: [
          'Verificar que el profesional o sala exista',
          'Contactar al staff de la clinica',
        ],
      },
      {
        id: 'treatment_not_found',
        description: 'El tratamiento no existe en el catalogo',
        suggestions: [
          'Verificar que el tratamiento exista en el catalogo',
          'Verificar tratamientos disponibles con list_treatment_options',
        ],
      },
      {
        id: 'session_already_completed',
        description: 'La sesion ya esta completada y no se puede cancelar',
        suggestions: [
          'Esta sesion ya ha sido completada',
          'Las sesiones completadas no se pueden cancelar directamente',
        ],
      },
      {
        id: 'session_already_cancelled',
        description: 'La sesion ya esta cancelada',
        suggestions: [
          'Esta sesion ya esta cancelada',
          'No se requiere accion adicional',
        ],
      },
      {
        id: 'invalid_transition',
        description: 'La transicion de estado no es valida',
        suggestions: [
          'La sesion puede no estar en un estado valido para esta accion',
          'Verificar el estado actual de la sesion primero',
        ],
      },
    ];
  }

  return common;
}

function buildDefaultProtocols(mode: 'full' | 'tasks-only'): Record<string, Protocol> {
  if (mode === 'full') {
    return {
      signature_implants: {
        name: 'Protocolo de Implantologia Avanzada',
        description: 'Protocolo integral de implantologia avanzada',
        responseTemplate:
          'Este es nuestro protocolo mas completo de implantologia avanzada. ' +
          'No se trata solo de colocar implantes, sino de planificar digitalmente todo el caso, ' +
          'realizar cirugia guiada, usar materiales premium y acompanar al paciente antes, durante y despues.',
        sections: [
          'Planificacion digital',
          'Cirugia guiada',
          'Materiales premium',
          'Acompanamiento',
        ],
      },
      first_visit: {
        name: 'Primera Visita',
        description: 'Guia para la primera visita de cualquier paciente',
        responseTemplate:
          'En tu primera visita haremos una valoracion completa, fotografias clinicas y escaneo digital. ' +
          'La visita informativa es gratuita. Solo se cobra radiografia si es necesaria para el diagnostico.',
      },
    };
  }

  return {
    pregnancy_weeks: {
      name: 'Derivacion por semanas de gestacion',
      description: 'Protocolo para orientar segun semanas de embarazo',
      responseTemplate: 'De cuantas semanas estas?',
    },
    sensitive_situations: {
      name: 'Situaciones Sensibles',
      description: 'Protocolo para situaciones emocionales delicadas',
      responseTemplate: 'Entendemos perfectamente...',
    },
  };
}

function buildDefaultServiceCatalog(): ServiceCatalog {
  return {
    treatments: [
      {
        name: 'Primera visita',
        description: 'Consulta inicial de evaluación',
        priceDescription: 'Consultar en clínica',
        requiresConsultation: true,
      },
    ],
  };
}

function buildDefaultTreatmentPolicyHints(): TreatmentPolicyHint[] {
  return [];
}

function buildDefaultSystemPromptInstructions(): SystemPromptInstructions {
  return {
    notesForAdvisor: [],
    knownGaps: [],
    recommendedNextSteps: [],
  };
}

function buildDefaultConversationResumption(): ConversationResumptionConfig {
  return {
    instructions: {
      continuous: 'Continua la conversacion sin saludar. El paciente esta respondiendo inmediatamente.',
      short_break:
        'Puedes reconocer la pausa con un tono natural (ej: "perfecto, continuamos"), pero NO saludes de nuevo.',
      same_period:
        'Saludo muy breve opcional, maximo 2 palabras. Solo si encaja naturalmente con la respuesta principal.',
      recent:
        'Saluda brevemente reconociendo la ausencia (maximo 4 palabras), luego atiende la consulta principal inmediatamente. NO te presentes como nuevo.',
      distant:
        'Saluda reconociendo la ausencia de forma natural. NO te presentes como si fuera la primera vez. Puedes decir algo como "Hola, hace tiempo que no hablamos". Luego atiende la consulta principal.',
    },
  };
}

export function buildDefaultStructuredLogicForMode(mode: 'full' | 'tasks-only'): StructuredLogic {
  const base: StructuredLogic = {
    version: '1.0',
    capabilities: buildDefaultCapabilities(mode),
    identity: buildDefaultIdentity(mode),
    styleRules: buildDefaultStyleRules(mode),
    responseTemplates: buildDefaultResponseTemplates(mode),
    faq: buildDefaultFaq(mode),
    serviceCatalog: buildDefaultServiceCatalog(),
    intents: buildDefaultIntents(mode),
    toolOrchestration: { flows: buildDefaultFlows(mode) },
    rules: buildDefaultRules(mode),
    errorCategories: buildDefaultErrorCategories(mode),
    protocols: buildDefaultProtocols(mode),
    treatmentPolicyHints: buildDefaultTreatmentPolicyHints(),
    systemPromptInstructions: buildDefaultSystemPromptInstructions(),
    conversationResumption: buildDefaultConversationResumption(),
  };

  return base;
}
