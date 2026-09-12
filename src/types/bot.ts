import { Context, Scenes } from 'telegraf';

// Extend standard context to include Scene and Wizard capabilities
export interface BotContext extends Context {
  scene: Scenes.SceneContextScene<BotContext, Scenes.WizardSessionData>;
  wizard: Scenes.WizardContextWizard<BotContext>;
}
