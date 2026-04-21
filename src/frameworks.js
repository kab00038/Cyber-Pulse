const OWASP_TOP_10 = [
  {
    id: "A01:2021",
    name: "Broken Access Control",
    keywords: ["access control", "authorization", "idor", "privilege escalation", "bypass authentication", "elevation"]
  },
  {
    id: "A02:2021",
    name: "Cryptographic Failures",
    keywords: ["cryptographic", "crypto", "encryption", "plaintext", "tls", "certificate", "cipher"]
  },
  {
    id: "A03:2021",
    name: "Injection",
    keywords: ["sql injection", "command injection", "injection", "xss", "cross-site scripting", "ldap injection", "template injection"]
  },
  {
    id: "A04:2021",
    name: "Insecure Design",
    keywords: ["design flaw", "insecure design", "logic flaw", "business logic"]
  },
  {
    id: "A05:2021",
    name: "Security Misconfiguration",
    keywords: ["misconfiguration", "default credentials", "debug mode", "exposed admin", "improper configuration"]
  },
  {
    id: "A06:2021",
    name: "Vulnerable and Outdated Components",
    keywords: ["outdated", "dependency", "library", "package", "third-party component", "unpatched"]
  },
  {
    id: "A07:2021",
    name: "Identification and Authentication Failures",
    keywords: ["authentication", "auth bypass", "credential stuffing", "brute force", "session fixation", "session hijacking"]
  },
  {
    id: "A08:2021",
    name: "Software and Data Integrity Failures",
    keywords: ["deserialization", "supply chain", "code signing", "integrity", "tampering", "update mechanism"]
  },
  {
    id: "A09:2021",
    name: "Security Logging and Monitoring Failures",
    keywords: ["logging", "monitoring", "audit trail", "insufficient logging"]
  },
  {
    id: "A10:2021",
    name: "Server-Side Request Forgery (SSRF)",
    keywords: ["ssrf", "server-side request forgery"]
  }
];

const MITRE_TECHNIQUES = [
  {
    tacticId: "TA0001",
    tacticName: "Initial Access",
    id: "T1190",
    name: "Exploit Public-Facing Application",
    keywords: ["remote code execution", "rce", "public-facing", "exploit"]
  },
  {
    tacticId: "TA0001",
    tacticName: "Initial Access",
    id: "T1566",
    name: "Phishing",
    keywords: ["phishing", "malicious email"]
  },
  {
    tacticId: "TA0001",
    tacticName: "Initial Access",
    id: "T1133",
    name: "External Remote Services",
    keywords: ["vpn", "remote service", "rdp"]
  },
  {
    tacticId: "TA0002",
    tacticName: "Execution",
    id: "T1059",
    name: "Command and Scripting Interpreter",
    keywords: ["command injection", "shell", "script execution", "powershell"]
  },
  {
    tacticId: "TA0004",
    tacticName: "Privilege Escalation",
    id: "T1068",
    name: "Exploitation for Privilege Escalation",
    keywords: ["privilege escalation", "elevation", "kernel exploit"]
  },
  {
    tacticId: "TA0006",
    tacticName: "Credential Access",
    id: "T1110",
    name: "Brute Force",
    keywords: ["brute force", "password spraying", "credential stuffing"]
  },
  {
    tacticId: "TA0006",
    tacticName: "Credential Access",
    id: "T1555",
    name: "Credentials from Password Stores",
    keywords: ["credential theft", "password store", "token theft"]
  },
  {
    tacticId: "TA0008",
    tacticName: "Lateral Movement",
    id: "T1021",
    name: "Remote Services",
    keywords: ["lateral movement", "remote services", "smb", "rdp"]
  },
  {
    tacticId: "TA0010",
    tacticName: "Exfiltration",
    id: "T1041",
    name: "Exfiltration Over C2 Channel",
    keywords: ["data exfiltration", "exfiltrate", "data theft"]
  },
  {
    tacticId: "TA0040",
    tacticName: "Impact",
    id: "T1486",
    name: "Data Encrypted for Impact",
    keywords: ["ransomware", "encrypt", "data encrypted"]
  },
  {
    tacticId: "TA0040",
    tacticName: "Impact",
    id: "T1499",
    name: "Endpoint Denial of Service",
    keywords: ["denial of service", "dos", "ddos"]
  }
];

const MITRE_TACTICS = Array.from(
  MITRE_TECHNIQUES.reduce((map, item) => {
    if (!map.has(item.tacticId)) {
      map.set(item.tacticId, { id: item.tacticId, name: item.tacticName, techniques: [] });
    }

    map.get(item.tacticId).techniques.push({ id: item.id, name: item.name, keywords: item.keywords });
    return map;
  }, new Map()).values()
);

function normalize(text) {
  return String(text || "").toLowerCase();
}

function scoreByKeywords(content, keywords) {
  let score = 0;
  for (const keyword of keywords) {
    if (content.includes(keyword.toLowerCase())) {
      score += keyword.includes(" ") ? 3 : 2;
    }
  }
  return score;
}

function mapOwasp(content) {
  return OWASP_TOP_10
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      score: scoreByKeywords(content, entry.keywords)
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

function mapMitre(content) {
  const techniqueMatches = [];

  for (const tactic of MITRE_TACTICS) {
    for (const technique of tactic.techniques) {
      const score = scoreByKeywords(content, technique.keywords);
      if (score <= 0) continue;
      techniqueMatches.push({
        tacticId: tactic.id,
        tacticName: tactic.name,
        techniqueId: technique.id,
        techniqueName: technique.name,
        score
      });
    }
  }

  techniqueMatches.sort((a, b) => b.score - a.score);

  const topTechniques = techniqueMatches.slice(0, 4);
  const tacticMap = new Map();

  for (const item of topTechniques) {
    if (!tacticMap.has(item.tacticId)) {
      tacticMap.set(item.tacticId, { id: item.tacticId, name: item.tacticName });
    }
  }

  return {
    tactics: Array.from(tacticMap.values()),
    techniques: topTechniques.map((item) => ({
      id: item.techniqueId,
      name: item.techniqueName,
      tacticId: item.tacticId,
      tacticName: item.tacticName,
      score: item.score
    }))
  };
}

export function mapToFrameworks({ cveId = "", summary = "", title = "" }) {
  const content = normalize(`${title} ${summary}`);
  const owasp = mapOwasp(content);
  const mitre = mapMitre(content);

  return {
    cveId,
    owasp,
    mitre,
    confidence: boundedConfidence(owasp, mitre)
  };
}

function boundedConfidence(owasp, mitre) {
  const score = owasp.reduce((sum, item) => sum + item.score, 0) + mitre.techniques.reduce((sum, item) => sum + item.score, 0);
  if (score >= 16) return "high";
  if (score >= 8) return "medium";
  return "low";
}
