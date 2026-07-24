import test from 'node:test';
import assert from 'node:assert/strict';
import { getAssistantReply } from '../../docs/js/assistant/assistant-core.js';

test('answers dean dashboard questions with module guidance', () => {
  const reply = getAssistantReply('What can I do on this dean dashboard?', {
    pageName: 'Dean Dashboard',
    activeTab: 'overviewTab'
  });

  assert.match(reply, /overview|rankings|reports|subjects|marks/i);
});

test('explains grading configuration and reports', () => {
  const reply = getAssistantReply('How do I configure grading and generate reports?', {
    pageName: 'Dean Dashboard',
    activeTab: 'rankingsTab'
  });

  assert.match(reply, /grading|reports|configure/i);
});

test('gives role-specific guidance for teachers and learners', () => {
  const teacherReply = getAssistantReply('How do teachers use this portal?', {
    pageName: 'Teacher Dashboard'
  });
  const learnerReply = getAssistantReply('How do learners get started?', {
    pageName: 'Learner Dashboard'
  });

  assert.match(teacherReply, /for teachers|marks|materials/i);
  assert.match(learnerReply, /for learners|progress|resources/i);
});

test('returns distinct answers for system overview and features prompts', () => {
  const overviewReply = getAssistantReply('What is this system?');
  const featuresReply = getAssistantReply('What features does it offer?');

  assert.match(overviewReply, /cbc school portal|role-based|centralizes/i);
  assert.match(featuresReply, /learner performance tracking|reporting tools|communication features/i);
  assert.notEqual(overviewReply, featuresReply);
});

test('answers contact-related questions with school support guidance', () => {
  const reply = getAssistantReply('How can I contact the school?');

  assert.match(reply, /contact|support|school/i);
});

test('answers founder-related questions with the correct profile', () => {
  const reply = getAssistantReply('Who founded this platform?');

  assert.match(reply, /emmanuel mutegi|founder|muts tech/i);
});

test('includes markup for styled contact details', () => {
  const reply = getAssistantReply('How can I contact the school?');

  assert.match(reply, /system-assistant-contact-pill/i);
  assert.match(reply, /mailto:/i);
  assert.match(reply, /tel:/i);
});
