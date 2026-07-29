import type { AppData, Chapter, Subject, Topic } from '@revision-app/shared';
import { makeId } from '@revision-app/shared';
import { makeBuiltinTags } from '@/lib/domain/builtinTags';

// Source of truth: docs/ESE-Civil-Engineering-Syllabus.md (UPSC ESE Civil, 2026).
// 12 technical subjects + General Studies & Engineering Aptitude (Prelims Paper I).
// Bold sub-sections in the syllabus become Chapters; detailed bullets become Topics.
interface SeedSubject {
  name: string;
  color: string;
  icon: string;
  chapters: { name: string; topics: string[] }[];
}

const SYLLABUS: SeedSubject[] = [
  {
    name: 'Building Materials',
    color: '#eab308',
    icon: 'Boxes',
    chapters: [
      {
        name: 'Materials & Concrete Technology',
        topics: [
          'Stone, Lime, Glass, Plastics, Steel, FRP, Ceramics, Aluminium, Fly Ash, Bricks, Aggregates & Timber — classification, properties & selection',
          'Basic Admixtures — types and applications',
          'Cement — types, composition, properties, uses, specifications & tests',
          'Lime & Cement Mortars and Concrete — properties and tests',
          'Design of Concrete Mixes — proportioning of aggregates & mix design methods',
        ],
      },
    ],
  },
  {
    name: 'Solid Mechanics',
    color: '#ef4444',
    icon: 'Dumbbell',
    chapters: [
      {
        name: 'Solid Mechanics',
        topics: [
          'Elastic constants',
          'Stress and plane stress',
          'Strains and plane strain',
          "Mohr's circle of stress and strain",
          'Elastic theories of failure',
          'Principal stresses',
          'Bending, Shear and Torsion',
        ],
      },
    ],
  },
  {
    name: 'Structural Analysis',
    color: '#f97316',
    icon: 'Building2',
    chapters: [
      {
        name: 'Structural Analysis',
        topics: [
          'Basics of strength of materials',
          'Types of stresses and strains',
          'Bending moments and shear force',
          'Concept of bending and shear stresses',
          'Analysis of determinate and indeterminate structures',
          'Trusses, beams, plane frames',
          'Rolling loads and Influence Lines',
          'Unit load method and other methods',
          'Free and forced vibrations of SDOF & MDOF systems',
          'Suspended cables',
          'Concepts and use of computer-aided design',
        ],
      },
    ],
  },
  {
    name: 'Design of Steel Structures',
    color: '#64748b',
    icon: 'Frame',
    chapters: [
      {
        name: 'Steel Design',
        topics: [
          'Principles of Working Stress method',
          'Design of tension and compression members',
          'Design of beams and beam-columns',
          'Design of connections',
          'Design of built-up sections & girders',
          'Industrial roofs',
          'Principles of Ultimate Load Design',
        ],
      },
    ],
  },
  {
    name: 'Design of Concrete & Masonry Structures',
    color: '#10b981',
    icon: 'Building',
    chapters: [
      {
        name: 'RCC, Prestressed & Masonry Design',
        topics: [
          'Limit State Design for bending, shear, axial compression & combined forces',
          'Design of beams, slabs, lintels, foundations, retaining walls, tanks, staircases',
          'Principles of Prestressed Concrete Design — materials & methods',
          'Earthquake resistant design of structures',
          'Design of masonry structures',
        ],
      },
    ],
  },
  {
    name: 'Construction Practice, Planning & Management',
    color: '#8b5cf6',
    icon: 'HardHat',
    chapters: [
      {
        name: 'Construction Planning & Management',
        topics: [
          'Construction planning, equipment, site investigation & management',
          'Estimation with project management tools & network analysis',
          'Analysis of rates of various types of works',
          'Tendering process and contract management',
          'Quality control, productivity & operation cost',
          'Land acquisition',
          'Labour safety and welfare',
        ],
      },
    ],
  },
  {
    name: 'Flow of Fluids, Hydraulic Machines & Hydro Power',
    color: '#06b6d4',
    icon: 'Droplets',
    chapters: [
      {
        name: 'Fluid Mechanics, Open Channel & Pipe Flow',
        topics: [
          'Fluid properties',
          'Dimensional analysis and modeling',
          'Fluid dynamics — flow kinematics and measurements',
          'Flow net',
          'Viscosity, boundary layer & control, drag, lift',
          'Principles in open channel flow & flow controls',
          'Hydraulic jump, surges',
          'Pipe networks',
        ],
      },
      {
        name: 'Hydraulic Machines & Hydro Power',
        topics: [
          'Various pumps, air vessels',
          'Hydraulic turbines — types, classification & performance parameters',
          'Power house — classification and layout',
          'Storage, pondage',
          'Control of supply',
        ],
      },
    ],
  },
  {
    name: 'Hydrology & Water Resources Engineering',
    color: '#0ea5e9',
    icon: 'CloudRain',
    chapters: [
      {
        name: 'Hydrology',
        topics: [
          'Hydrological cycle',
          'Ground water hydrology, well hydrology & data analysis',
          'Streams and their gauging',
          'River morphology',
          'Floods, droughts and their management',
          'Capacity of reservoirs',
        ],
      },
      {
        name: 'Water Resources Engineering',
        topics: [
          'Multipurpose uses of water',
          'River basins and their potential',
          'Irrigation systems & water demand assessment',
          'Storage and their yields',
          'Water logging, canal and drainage design',
          'Gravity dams, falls, weirs, energy dissipaters, barrage',
          'Distribution, cross-drainage & head-works and their design',
          'Concepts in canal design, construction & maintenance',
          'River training, measurement & analysis of rainfall',
        ],
      },
    ],
  },
  {
    name: 'Environmental Engineering',
    color: '#14b8a6',
    icon: 'Leaf',
    chapters: [
      {
        name: 'Water Supply Engineering',
        topics: [
          'Sources, estimation, quality standards, testing & treatment of water',
          'Rural, industrial & institutional water supply',
          'Physical, chemical & biological characteristics & sources of water',
          'Pollutants in water and their effects',
          'Estimation of water demand',
          'Drinking water standards',
          'Water treatment plants',
          'Water distribution networks',
        ],
      },
      {
        name: 'Waste Water Engineering',
        topics: [
          'Domestic waste water — planning & design, sewage collection & disposal',
          'Plumbing systems',
          'Components and layout of sewerage system',
          'Domestic waste-water disposal system design',
          'Sludge management — treatment, disposal & reuse of effluents',
          'Design of sewage treatment plants',
          'Industrial waste waters and treatment plants',
        ],
      },
      {
        name: 'Solid Waste Management',
        topics: [
          'Sources & classification of solid wastes',
          'Planning and design of solid waste management systems',
          'Collection, transportation and disposal systems',
          'Sanitary landfill — design and operation',
          'Beneficial aspects — composting, energy recovery, recycling',
        ],
      },
      {
        name: 'Air, Noise Pollution & Ecology',
        topics: [
          'Sources and types of air pollution',
          'Air quality standards and monitoring',
          'Noise pollution — sources, standards and control',
          'Ecological concepts and environmental impact assessment',
          'Environmental legislation — Water Act, Air Act, Environment Protection Act',
        ],
      },
    ],
  },
  {
    name: 'Geo-technical & Foundation Engineering',
    color: '#a16207',
    icon: 'Mountain',
    chapters: [
      {
        name: 'Geo-technical Engineering',
        topics: [
          'Soil exploration — planning and methods',
          'Properties of soil — index properties, classification & tests',
          'Permeability & seepage — Darcy\'s law, flow nets',
          'Compressibility and consolidation — Terzaghi\'s theory',
          'Shearing resistance — Mohr-Coulomb criterion, tests',
          'Earth pressure theories — Rankine, Coulomb',
          'Stress distribution in soil — Boussinesq equation',
          'Properties and uses of geo-synthetics',
        ],
      },
      {
        name: 'Foundation Engineering',
        topics: [
          'Types of foundations & selection criteria',
          'Bearing capacity of soils — Terzaghi & IS methods',
          'Settlement analysis — immediate, consolidation & secondary',
          'Design of shallow foundations — isolated, combined, raft',
          'Design and testing of deep foundations — piles and well foundations',
          'Slope stability analysis',
          'Design of earthen embankments, dams & earth retaining structures',
          'Principles of ground modifications — compaction, grouting, stone columns',
        ],
      },
    ],
  },
  {
    name: 'Surveying & Geology',
    color: '#3b82f6',
    icon: 'Compass',
    chapters: [
      {
        name: 'Surveying',
        topics: [
          'Classification of surveys and various methodologies',
          'Instruments and analysis of measurement of distances, elevation & directions',
          'Chain surveying and compass traversing',
          'Levelling — types and methods',
          'Theodolite surveying — horizontal and vertical angles',
          'Plane table surveying',
          'Field astronomy — determination of meridian, azimuth & time',
          'Global Positioning System (GPS) and GNSS',
          'Map preparation — contours and topographic mapping',
          'Photogrammetry and remote sensing concepts',
          'Survey layout for culverts, canals, bridges, road/railway alignment & buildings',
          'Setting out of curves — simple, compound and reverse',
        ],
      },
      {
        name: 'Geology',
        topics: [
          'Basic engineering geology — minerals and rocks',
          'Geological structures — folds, faults, joints and unconformities',
          'Geological maps and their interpretation',
          'Application of engineering geology in projects — dams, tunnels, foundations',
          'Rock mass classification — RMR and Q-system',
        ],
      },
    ],
  },
  {
    name: 'Transportation Engineering',
    color: '#ec4899',
    icon: 'TrafficCone',
    chapters: [
      {
        name: 'Highways',
        topics: [
          'Planning & construction methodology — road development plans',
          'Alignment and geometric design — sight distance, horizontal & vertical curves',
          'Traffic surveys and controls — volume, speed & origin-destination studies',
          'Traffic signals and road markings',
          'Principles of flexible pavement design — CBR method, IRC guidelines',
          'Principles of rigid pavement design — Westergaard\'s theory',
          'Pavement materials — bitumen, aggregates & tests',
        ],
      },
      {
        name: 'Tunneling',
        topics: [
          'Alignment of tunnels — factors governing selection',
          'Methods of construction — cut & cover, NATM, TBM',
          'Disposal of muck',
          'Drainage, lighting and ventilation of tunnels',
        ],
      },
      {
        name: 'Railway Systems',
        topics: [
          'Railway terminology — gauge, gradient, curves',
          'Planning and design of railway tracks',
          'Maintenance practices — track geometry and defects',
          'Track modernization — high-speed corridors',
        ],
      },
      {
        name: 'Harbours & Airports',
        topics: [
          'Harbour terminology — breakwaters, jetties, quays',
          'Harbour layouts and planning',
          'Airport layout — runway, taxiway, apron & terminal',
          'Airport planning and design — capacity and configuration',
          'Runway orientation — wind rose diagram',
        ],
      },
    ],
  },
  {
    name: 'General Studies & Engineering Aptitude',
    color: '#6366f1',
    icon: 'Newspaper',
    chapters: [
      {
        name: 'General Studies & Current Affairs',
        topics: [
          'Current issues of national & international importance (social, economic, industrial)',
          'Ethics and values in the engineering profession',
          'Basics of Energy and Environment — conservation, pollution, climate change',
          'Environmental impact assessment',
        ],
      },
      {
        name: 'Engineering Aptitude & Mathematics',
        topics: [
          'Logical Reasoning & Analytical Ability',
          'Engineering Mathematics — Linear Algebra',
          'Engineering Mathematics — Calculus & Differential Equations',
          'Engineering Mathematics — Probability & Statistics',
          'Numerical Analysis and numerical methods',
        ],
      },
      {
        name: 'Design, Standards & Project Management',
        topics: [
          'General Principles of Design, Drawing & importance of Safety',
          'Standards and Quality practices in production, construction, maintenance & services',
          'Basics of Project Management — PERT/CPM, scheduling',
          'Basics of Material Science and Engineering',
          'ICT-based tools and their applications in engineering (networking, e-governance)',
        ],
      },
    ],
  },
];

export function seedData(): AppData {
  const subjects: Record<string, Subject> = {};
  const chapters: Record<string, Chapter> = {};
  const topics: Record<string, Topic> = {};
  const subjectOrder: string[] = [];
  const now = Date.now();

  SYLLABUS.forEach((subj, si) => {
    const sid = makeId();
    const chapterIds: string[] = [];
    subj.chapters.forEach((ch, ci) => {
      const cid = makeId();
      const topicIds: string[] = [];
      ch.topics.forEach((title, ti) => {
        const tid = makeId();
        topics[tid] = {
          id: tid, chapterId: cid, title, notes: '', order: ti,
          difficulty: 'Medium', priority: 'Medium',
          revisionHistory: [], createdAt: now, updatedAt: now,
        };
        topicIds.push(tid);
      });
      chapters[cid] = {
        id: cid, subjectId: sid, name: ch.name, order: ci,
        difficulty: 'Medium', priority: 'Medium', topicIds,
      };
      chapterIds.push(cid);
    });
    subjects[sid] = { id: sid, name: subj.name, color: subj.color, icon: subj.icon, order: si, chapterIds };
    subjectOrder.push(sid);
  });

  const { tags, tagOrder } = makeBuiltinTags();
  return { subjects, chapters, topics, subjectOrder, tags, tagOrder };
}

// ── School Tuition (PUC / NEET-JEE + SSLC) seed ──────────────────────────────

const TUITION_SYLLABUS: SeedSubject[] = [
  {
    name: 'Physics',
    color: '#6366f1',
    icon: 'Atom',
    chapters: [
      {
        name: 'Mechanics',
        topics: [
          "Newton's Laws of Motion",
          'Rotational Dynamics',
          'Work, Energy & Power',
          'Gravitation',
          'Simple Harmonic Motion',
        ],
      },
      {
        name: 'Electrostatics',
        topics: [
          "Coulomb's Law & Electric Field",
          "Gauss's Law & Applications",
          'Electric Potential & Capacitance',
        ],
      },
      {
        name: 'Optics',
        topics: [
          'Ray Optics & Optical Instruments',
          'Wave Optics — Interference & Diffraction',
        ],
      },
      {
        name: 'Modern Physics',
        topics: [
          'Photoelectric Effect',
          'Bohr Model & Hydrogen Spectra',
          'Nuclei & Radioactivity',
        ],
      },
    ],
  },
  {
    name: 'Mathematics',
    color: '#f97316',
    icon: 'Calculator',
    chapters: [
      {
        name: 'Algebra',
        topics: [
          'Quadratic Equations',
          'Pair of Linear Equations in Two Variables',
          'Arithmetic Progressions',
          'Polynomials',
        ],
      },
      {
        name: 'Trigonometry',
        topics: [
          'Trigonometric Identities',
          'Trigonometric Ratios',
          'Heights & Distances',
        ],
      },
      {
        name: 'Coordinate Geometry',
        topics: [
          'Circles',
          'Distance & Section Formula',
          'Area of a Triangle',
        ],
      },
    ],
  },
  {
    name: 'Chemistry',
    color: '#10b981',
    icon: 'FlaskConical',
    chapters: [
      {
        name: 'Chemical Bonding',
        topics: [
          'Chemical Bonding & Molecular Structure',
          'VSEPR Theory & Hybridisation',
          'Molecular Orbital Theory',
        ],
      },
      {
        name: 'Organic Chemistry',
        topics: [
          'Aldehydes, Ketones & Carboxylic Acids',
          'Hydrocarbons — Alkanes, Alkenes & Alkynes',
          'Haloalkanes & Haloarenes',
        ],
      },
    ],
  },
];

// ── Software Engineering / GATE CS seed ──────────────────────────────────────

const SE_SYLLABUS: SeedSubject[] = [
  {
    name: 'Data Structures & Algorithms',
    color: '#6366f1',
    icon: 'GitBranch',
    chapters: [
      {
        name: 'Linear Data Structures',
        topics: [
          'Arrays — static & dynamic, operations, complexity',
          'Linked Lists — singly, doubly, circular',
          'Stacks — implementation, applications (balanced parentheses, infix→postfix)',
          'Queues — circular queue, deque, priority queue',
        ],
      },
      {
        name: 'Non-Linear Data Structures',
        topics: [
          'Trees — binary tree, traversals (inorder/preorder/postorder), height',
          'Binary Search Tree — insert, delete, search, balancing',
          'AVL Trees — rotations, balance factor',
          'Heaps — max-heap, min-heap, heapify, heap sort',
          'Graphs — representations (adjacency matrix/list), BFS, DFS',
        ],
      },
      {
        name: 'Searching & Sorting',
        topics: [
          'Sorting — bubble, selection, insertion, merge, quick, counting, radix',
          'Searching — linear, binary, interpolation, exponential',
          'Divide & Conquer — master theorem, recurrence relations',
        ],
      },
      {
        name: 'Advanced Algorithms',
        topics: [
          'Dynamic Programming — memoization vs tabulation, 0/1 knapsack, LCS, LIS',
          'Greedy Algorithms — activity selection, Huffman coding, fractional knapsack',
          'Backtracking — N-Queens, Sudoku solver, subset sum',
          'Graph Algorithms — Dijkstra, Bellman-Ford, Floyd-Warshall, Prim, Kruskal',
          'Hashing — hash functions, collision resolution (chaining, open addressing)',
        ],
      },
    ],
  },
  {
    name: 'Operating Systems',
    color: '#f97316',
    icon: 'Cpu',
    chapters: [
      {
        name: 'Process Management',
        topics: [
          'Process vs Thread — PCB, context switching, process states',
          'CPU Scheduling — FCFS, SJF, Round Robin, Priority, MLFQ',
          'Synchronization — race conditions, mutex, semaphores, monitors',
          'Deadlocks — conditions, prevention, avoidance (Banker\'s Algorithm), detection',
        ],
      },
      {
        name: 'Memory Management',
        topics: [
          'Memory Allocation — contiguous, fragmentation, compaction',
          'Paging — page tables, TLB, multi-level paging',
          'Segmentation — segmentation with paging',
          'Virtual Memory — demand paging, page replacement (FIFO, LRU, Optimal)',
          'Thrashing — working set model',
        ],
      },
      {
        name: 'Storage & I/O',
        topics: [
          'File Systems — FAT, inode, directory structures',
          'Disk Scheduling — FCFS, SSTF, SCAN, C-SCAN',
          'I/O Systems — DMA, buffering, caching, spooling',
        ],
      },
    ],
  },
  {
    name: 'Database Management Systems',
    color: '#10b981',
    icon: 'Database',
    chapters: [
      {
        name: 'Relational Model & SQL',
        topics: [
          'ER Model — entities, attributes, relationships, ER to relational mapping',
          'Relational Algebra — select, project, join, union, difference',
          'SQL — DDL, DML, DCL; joins, subqueries, aggregate functions',
          'Views, Triggers, Stored Procedures',
        ],
      },
      {
        name: 'Normalization',
        topics: [
          'Functional Dependencies — Armstrong\'s axioms, closure',
          'Normal Forms — 1NF, 2NF, 3NF, BCNF',
          'Decomposition — lossless join, dependency preservation',
        ],
      },
      {
        name: 'Transactions & Concurrency',
        topics: [
          'ACID Properties',
          'Transaction States — active, committed, aborted',
          'Concurrency Control — locks (S/X), two-phase locking, deadlock in DB',
          'Isolation Levels — read uncommitted to serializable',
          'Recovery — undo/redo logs, checkpointing',
        ],
      },
      {
        name: 'Indexing & Storage',
        topics: [
          'B-Tree and B+ Tree — structure, operations, use in DBMS',
          'Indexing — dense vs sparse, clustered vs unclustered',
          'Query Optimization — cost estimation, query plan, heuristics',
        ],
      },
    ],
  },
  {
    name: 'Computer Networks',
    color: '#3b82f6',
    icon: 'Network',
    chapters: [
      {
        name: 'Network Layers (OSI / TCP-IP)',
        topics: [
          'OSI Model — 7 layers, responsibilities, protocols at each layer',
          'TCP/IP Model — 4 layers, comparison with OSI',
          'Physical Layer — encoding, transmission media, multiplexing',
          'Data Link Layer — framing, error detection (CRC), flow control, MAC',
        ],
      },
      {
        name: 'Network & Transport Layer',
        topics: [
          'IP Addressing — IPv4, subnetting, CIDR, NAT',
          'IPv6 — address format, transition mechanisms',
          'Routing — RIP, OSPF, BGP, distance vector vs link state',
          'TCP vs UDP — connection management, congestion control, reliable delivery',
          'Flow Control — sliding window, stop-and-wait, Go-Back-N, selective repeat',
        ],
      },
      {
        name: 'Application Layer & Security',
        topics: [
          'DNS — resolution, record types',
          'HTTP/HTTPS — request/response, REST principles',
          'SMTP, FTP, SSH — protocol basics',
          'Network Security — SSL/TLS, public key cryptography, firewalls',
          'Wireless — Wi-Fi standards, CSMA/CA',
        ],
      },
    ],
  },
  {
    name: 'System Design',
    color: '#8b5cf6',
    icon: 'LayoutDashboard',
    chapters: [
      {
        name: 'Scalability Concepts',
        topics: [
          'Horizontal vs Vertical Scaling',
          'Load Balancing — round robin, least connections, consistent hashing',
          'Caching — cache invalidation, eviction policies, Redis vs Memcached',
          'CDN — content delivery, edge caching',
          'Database Sharding — range, hash, directory-based',
        ],
      },
      {
        name: 'Distributed Systems',
        topics: [
          'CAP Theorem — consistency, availability, partition tolerance',
          'Eventual Consistency — BASE model',
          'Message Queues — Kafka, RabbitMQ — pub/sub, producer-consumer',
          'Service Discovery & API Gateway',
          'Microservices vs Monolith — trade-offs',
        ],
      },
      {
        name: 'Design Case Studies',
        topics: [
          'URL Shortener (e.g. bit.ly)',
          'Rate Limiter — token bucket, leaky bucket',
          'Distributed Cache',
          'Social Media Feed — fanout on write vs read',
          'Search Autocomplete — trie, top-k',
        ],
      },
    ],
  },
  {
    name: 'Object-Oriented Programming',
    color: '#ec4899',
    icon: 'Boxes',
    chapters: [
      {
        name: 'OOP Principles',
        topics: [
          'Encapsulation, Abstraction, Inheritance, Polymorphism',
          'Classes & Objects — constructors, destructors, access modifiers',
          'Interfaces & Abstract Classes',
          'Method Overloading vs Overriding',
          'SOLID Principles',
        ],
      },
      {
        name: 'Design Patterns',
        topics: [
          'Creational — Singleton, Factory, Builder, Prototype',
          'Structural — Adapter, Decorator, Facade, Proxy',
          'Behavioral — Observer, Strategy, Command, Iterator',
        ],
      },
    ],
  },
  {
    name: 'Theory of Computation',
    color: '#14b8a6',
    icon: 'BrainCircuit',
    chapters: [
      {
        name: 'Automata Theory',
        topics: [
          'DFA — construction, minimization',
          'NFA — equivalence to DFA, ε-NFA',
          'Regular Expressions — to DFA/NFA conversion',
          'Context-Free Grammars — derivations, parse trees',
          'Pushdown Automata — acceptance by empty stack / final state',
        ],
      },
      {
        name: 'Computability & Complexity',
        topics: [
          'Turing Machines — variants, Church-Turing thesis',
          'Decidability — halting problem, reduction',
          'P vs NP — NP-complete, NP-hard problems',
          'Complexity Classes — P, NP, PSPACE, co-NP',
        ],
      },
    ],
  },
];

/** Build a fresh AppData seeded for a given domain. */
function buildSeed(syllabus: SeedSubject[]): AppData {
  const subjects: Record<string, Subject> = {};
  const chapters: Record<string, Chapter> = {};
  const topics: Record<string, Topic> = {};
  const subjectOrder: string[] = [];
  const now = Date.now();

  syllabus.forEach((subj, si) => {
    const sid = makeId();
    const chapterIds: string[] = [];
    subj.chapters.forEach((ch, ci) => {
      const cid = makeId();
      const topicIds: string[] = [];
      ch.topics.forEach((title, ti) => {
        const tid = makeId();
        topics[tid] = {
          id: tid, chapterId: cid, title, notes: '', order: ti,
          difficulty: 'Medium', priority: 'Medium',
          revisionHistory: [], createdAt: now, updatedAt: now,
        };
        topicIds.push(tid);
      });
      chapters[cid] = {
        id: cid, subjectId: sid, name: ch.name, order: ci,
        difficulty: 'Medium', priority: 'Medium', topicIds,
      };
      chapterIds.push(cid);
    });
    subjects[sid] = { id: sid, name: subj.name, color: subj.color, icon: subj.icon, order: si, chapterIds };
    subjectOrder.push(sid);
  });

  const { tags, tagOrder } = makeBuiltinTags();
  return { subjects, chapters, topics, subjectOrder, tags, tagOrder };
}

/** Return a freshly seeded AppData appropriate for the user's exam domain. */
export function seedDataForDomain(domain: string): AppData {
  switch (domain) {
    case 'civil-engineering':
      return buildSeed(SYLLABUS);
    case 'software-engineering':
    case 'gate-cs':
      return buildSeed(SE_SYLLABUS);
    case 'school-tuition':
      return buildSeed(TUITION_SYLLABUS);
    default:
      // Unknown domain → empty store with only built-in tags
      return buildSeed([]);
  }
}

