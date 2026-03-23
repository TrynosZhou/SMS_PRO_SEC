import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { StudentService } from '../../../services/student.service';
import { SettingsService } from '../../../services/settings.service';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-student-form',
  templateUrl: './student-form.component.html',
  styleUrls: ['./student-form.component.css']
})
export class StudentFormComponent implements OnInit {
  student: any = {
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    gender: '',
    address: '',
    phoneNumber: '',
    contactNumber: '',
    studentType: 'Day Scholar',
    usesTransport: false,
    usesDiningHall: false,
    isStaffChild: false,
    classId: '',
    parentId: '',
    photo: null
  };
  isEdit = false;
  error = '';
  success = '';
  submitting = false;
  maxDate = '';
  selectedPhoto: File | null = null;
  photoPreview: string | null = null;
  studentIdPrefix = 'JPS';
  readonly requiredFields = ['firstName', 'lastName', 'dateOfBirth', 'gender', 'contactNumber', 'studentType'];

  constructor(
    private studentService: StudentService,
    private settingsService: SettingsService,
    private route: ActivatedRoute,
    public router: Router
  ) {
    // Set max date to today (for date of birth)
    const today = new Date();
    this.maxDate = today.toISOString().split('T')[0];
  }

  ngOnInit() {
    this.loadStudentIdPrefix();
    const id = this.route.snapshot.params['id'];
    if (id) {
      this.isEdit = true;
      this.loadStudent(id);
    }
  }

  loadStudentIdPrefix() {
    this.settingsService.getSettings().subscribe({
      next: (settings: any) => {
        const prefix = typeof settings?.studentIdPrefix === 'string'
          ? settings.studentIdPrefix.trim()
          : '';
        if (prefix) {
          this.studentIdPrefix = prefix.toUpperCase();
        }
      },
      error: (err: any) => {
        console.error('Error loading student ID prefix:', err);
      }
    });
  }

  onStaffChildChange() {
    // If staff child is checked, automatically uncheck transport (staff children don't pay for transport)
    if (this.student.isStaffChild) {
      this.student.usesTransport = false;
    }
  }

  loadStudent(id: string) {
    this.studentService.getStudentById(id).subscribe({
      next: (data: any) => {
        console.log('Loaded student data:', data);
        
        // Format dateOfBirth for HTML date input (YYYY-MM-DD)
        let formattedDate = '';
        if (data.dateOfBirth) {
          const date = new Date(data.dateOfBirth);
          if (!isNaN(date.getTime())) {
            formattedDate = date.toISOString().split('T')[0];
          }
        }
        
        // Get classId - prefer direct classId, then class.id, then empty string
        const studentClassId = data.classId || data.class?.id || '';
        console.log('Setting classId to:', studentClassId);
        
        this.student = {
          ...data,
          dateOfBirth: formattedDate,
          classId: studentClassId,
          contactNumber: data.contactNumber || data.phoneNumber || '',
          usesTransport: data.usesTransport || false,
          usesDiningHall: data.usesDiningHall || false,
          isStaffChild: data.isStaffChild || false,
          photo: data.photo || null
        };
        
        // Set photo preview if photo exists
        if (data.photo) {
          this.photoPreview = `${environment.serverBaseUrl}${data.photo}`;
          this.student.photo = data.photo;
        }
        console.log('Formatted student data:', this.student);
      },
      error: (err: any) => {
        console.error('Error loading student:', err);
        this.error = err.error?.message || 'Failed to load student';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  onPhotoSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        this.error = 'Please select an image file';
        setTimeout(() => this.error = '', 5000);
        return;
      }
      
      // Validate file size (max 2MB)
      if (file.size > 2 * 1024 * 1024) {
        this.error = 'Image size must be less than 2MB';
        setTimeout(() => this.error = '', 5000);
        return;
      }
      
      this.selectedPhoto = file;
      
      // Create preview
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.photoPreview = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  }

  removePhoto() {
    this.selectedPhoto = null;
    this.photoPreview = null;
    this.student.photo = null;
  }

  private calculateAge(dateString: string): number {
    const dob = new Date(dateString);
    if (isNaN(dob.getTime())) {
      return 0;
    }
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    return age;
  }

  onSubmit() {
    this.error = '';
    this.success = '';
    this.submitting = true;

    // Validate required fields
    if (!this.student.firstName || !this.student.lastName || !this.student.dateOfBirth || 
        !this.student.gender || !this.student.contactNumber || !this.student.studentType) {
      this.error = 'Please fill in all required fields';
      this.submitting = false;
      return;
    }

    // Class is now optional - students can be enrolled later
    // Validation removed - classId can be empty

    const studentAge = this.calculateAge(this.student.dateOfBirth);
    if (studentAge < 11 || studentAge > 20) {
      this.error = 'Students must be between 11 and 20 years old at registration';
      this.submitting = false;
      return;
    }
    
    if (this.isEdit) {
      // Prepare update data - exclude fields that shouldn't be updated
      const updateData: any = {
        firstName: this.student.firstName,
        lastName: this.student.lastName,
        dateOfBirth: this.student.dateOfBirth,
        gender: this.student.gender,
        address: this.student.address || null,
        contactNumber: this.student.contactNumber,
        studentType: this.student.studentType,
        usesTransport: this.student.usesTransport || false,
        usesDiningHall: this.student.usesDiningHall || false,
        isStaffChild: this.student.isStaffChild || false
      };

      // Include phoneNumber if provided
      if (this.student.phoneNumber) {
        updateData.phoneNumber = this.student.phoneNumber;
      }

      // Always include classId if it's set
      if (this.student.classId) {
        updateData.classId = this.student.classId;
      } else {
        updateData.classId = null;
      }

      // Only include parentId if it exists
      if (this.student.parentId) {
        updateData.parentId = this.student.parentId;
      }

      // Include photo path if no new photo is selected but photo exists
      if (!this.selectedPhoto && this.student.photo) {
        updateData.photo = this.student.photo;
      }

      console.log('Updating student with ID:', this.student.id);
      console.log('Update data:', updateData);

      this.studentService.updateStudent(this.student.id, updateData, this.selectedPhoto || undefined).subscribe({
        next: (response: any) => {
          console.log('Student update response:', response);
          this.success = response.message || 'Student updated successfully';
          this.submitting = false;
          setTimeout(() => this.router.navigate(['/students']), 1500);
        },
        error: (err: any) => {
          console.error('Error updating student:', err);
          this.error = err.error?.message || err.message || 'Failed to update student';
          this.submitting = false;
          setTimeout(() => this.error = '', 5000);
        }
      });
    } else {
      // For new students, don't send studentNumber (it will be auto-generated).
      // Class is assigned only via Student Manager → Enroll Student.
      const studentData = { ...this.student };
      delete studentData.studentNumber;
      delete studentData.classId;

      this.studentService.createStudent(studentData, this.selectedPhoto || undefined).subscribe({
        next: (response: any) => {
          this.success =
            response.message ||
            'Student registered successfully. Use Enroll Student to place them in a class.';
          this.submitting = false;
          setTimeout(() => this.router.navigate(['/students']), 1800);
        },
        error: (err: any) => {
          this.error = err.error?.message || 'Failed to create student';
          this.submitting = false;
          setTimeout(() => this.error = '', 5000);
        }
      });
    }
  }

  getAgePreview(): number | null {
    if (!this.student?.dateOfBirth) {
      return null;
    }
    const age = this.calculateAge(this.student.dateOfBirth);
    return age > 0 ? age : null;
  }

  getCompletionPercent(): number {
    const completed = this.requiredFields.filter(field => {
      const value = this.student?.[field];
      return value !== null && value !== undefined && String(value).trim() !== '';
    }).length;
    return Math.round((completed / this.requiredFields.length) * 100);
  }

}
