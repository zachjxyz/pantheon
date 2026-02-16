import { readdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { SkillEntry, SkillsRegistry } from './types.js';

const SKILLS_DIR = join(homedir(), '.claude', 'skills');
const REGISTRY_PATH = join(homedir(), '.claude', 'pantheon-skills.json');

function parseFrontmatter(content: string): { name: string; description: string } | null {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return null;

  const yaml = match[1];
  const nameMatch = yaml.match(/^name:\s*(.+)$/m);
  const descMatch = yaml.match(/^description:\s*(.+)$/m);

  if (!nameMatch) return null;

  return {
    name: nameMatch[1].trim(),
    description: descMatch ? descMatch[1].trim() : '',
  };
}

function scanSkills(): SkillEntry[] {
  let dirs: string[];
  try {
    dirs = readdirSync(SKILLS_DIR);
  } catch {
    console.error(`Skills directory not found: ${SKILLS_DIR}`);
    return [];
  }

  const skills: SkillEntry[] = [];

  for (const dir of dirs) {
    if (dir === 'pantheon') continue;

    const skillMdPath = join(SKILLS_DIR, dir, 'SKILL.md');
    try {
      const stat = statSync(skillMdPath);
      if (!stat.isFile()) continue;
    } catch {
      continue;
    }

    try {
      const content = readFileSync(skillMdPath, 'utf-8');
      const frontmatter = parseFrontmatter(content);
      if (frontmatter) {
        skills.push({
          name: frontmatter.name,
          description: frontmatter.description,
          path: skillMdPath,
        });
      }
    } catch {
      // Skip unreadable skills
    }
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

function main() {
  const skills = scanSkills();
  const registry: SkillsRegistry = {
    skills,
    lastScanned: new Date().toISOString(),
  };

  writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
  console.log(`Scanned ${skills.length} skills → ${REGISTRY_PATH}`);

  for (const skill of skills) {
    console.log(`  ${skill.name} — ${skill.description.slice(0, 80)}${skill.description.length > 80 ? '...' : ''}`);
  }
}

main();
