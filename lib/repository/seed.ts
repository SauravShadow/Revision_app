import type { AppData, Chapter, Subject, Topic } from '@/lib/domain/types';
import { makeId } from '@/lib/domain/id';

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
          'Planning and design of management system',
          'Disposal systems',
          'Beneficial aspects of wastes & utilization',
        ],
      },
      {
        name: 'Air, Noise Pollution & Ecology',
        topics: [
          'Concepts and general methodology',
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
          'Properties of soil, classification, tests & inter-relationships',
          'Permeability & seepage',
          'Compressibility, consolidation & shearing resistance',
          'Earth pressure theories & stress distribution in soil',
          'Properties and uses of geo-synthetics',
        ],
      },
      {
        name: 'Foundation Engineering',
        topics: [
          'Types of foundations & selection criteria',
          'Bearing capacity, settlement analysis',
          'Design and testing of shallow & deep foundations',
          'Slope stability, embankments, dams & earth retaining structures',
          'Principles of ground modifications',
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
          'Classification of surveys, methodologies, instruments & measurement analysis',
          'Field astronomy',
          'Global Positioning System (GPS)',
          'Map preparation',
          'Photogrammetry and remote sensing concepts',
          'Survey layout for culverts, canals, bridges, road/railway alignment & buildings',
          'Setting out of curves',
        ],
      },
      {
        name: 'Geology',
        topics: [
          'Engineering geology & its application in projects',
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
          'Planning & construction methodology',
          'Alignment and geometric design',
          'Traffic surveys and controls',
          'Principles of flexible and rigid pavement design',
        ],
      },
      {
        name: 'Tunneling',
        topics: [
          'Alignment and methods of construction',
          'Disposal of muck, drainage, lighting & ventilation',
        ],
      },
      {
        name: 'Railway Systems',
        topics: [
          'Terminology, planning, design & maintenance practices',
          'Track modernization',
        ],
      },
      {
        name: 'Harbours',
        topics: [
          'Terminology, layouts and planning',
        ],
      },
      {
        name: 'Airports',
        topics: [
          'Layout, planning and design',
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
        name: 'Prelims Paper I',
        topics: [
          'Current issues of national & international importance (social, economic, industrial)',
          'Engineering Aptitude — Logical Reasoning & Analytical Ability',
          'Engineering Mathematics and Numerical Analysis',
          'General Principles of Design, Drawing & importance of Safety',
          'Standards and Quality practices in production, construction, maintenance & services',
          'Basics of Energy and Environment',
          'Basics of Project Management',
          'Basics of Material Science and Engineering',
          'ICT-based tools and their applications in engineering',
          'Ethics and values in the engineering profession',
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

  return { subjects, chapters, topics, subjectOrder };
}
