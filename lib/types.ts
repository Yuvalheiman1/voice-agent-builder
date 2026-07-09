export type AssistantConfig = {
  name: string;
  firstMessage: string;
  systemPrompt: string;
  voiceId: string;
  qualificationQuestions: string[];
};

export type Agent = {
  id: string;
  config: AssistantConfig;
  personaId?: string; // which pre-built persona this agent was created from (for its avatar)
  vapiId?: string; // set once pushed to Vapi
  createdAt: number;
};

export type LeadStatus = "new" | "calling" | "qualified" | "booked" | "no-answer";

export type Lead = {
  id: string;
  name: string;
  phone: string;
  status: LeadStatus;
  createdAt: number;
};
